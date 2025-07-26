"""
PDF to Markdown MCP Server

이 MCP 서버는 PDF 파일을 마크다운 형식으로 변환하는 도구를 제공합니다.
LLM이 PDF 문서의 내용을 읽고 분석할 수 있도록 도와줍니다.

제공하는 도구:
1. convert_pdf_to_markdown: PDF를 마크다운 텍스트로 변환하여 반환
2. save_pdf_as_markdown: PDF를 마크다운으로 변환하여 파일로 저장

사용법:
- 전체 페이지: pages 매개변수를 비워두거나 None으로 설정
- 특정 페이지: "4" (4페이지만)
- 페이지 범위: "2-6" (2페이지부터 6페이지까지)
- 여러 페이지: "1,3,5" (1, 3, 5 페이지)
"""

import pymupdf4llm
import pathlib
import os
from typing import Optional
from mcp.server.fastmcp import FastMCP

# Initialize FastMCP server
mcp = FastMCP("pdf-reader")

@mcp.tool()
async def convert_pdf_to_markdown(pdf_path: str, pages: Optional[str] = None) -> str:
    """
    Convert PDF file to markdown text so that LLM can read it.
    
    Args:
        pdf_path: Absolute path to the PDF file (e.g., "/Users/username/documents/sample.pdf")
        pages: Page specification (optional)
            - None or empty string: All pages (default)
            - "2-6": Pages 2 to 6
            - "4": Page 4 only
            - "1,3,5": Pages 1, 3, and 5 (comma-separated)
    """
    try:
        # Convert to absolute path and validate
        abs_pdf_path = os.path.abspath(pdf_path)
        
        # Check if file exists
        if not os.path.exists(abs_pdf_path):
            return f"Error: PDF file not found: {abs_pdf_path}"
        
        # Check if it's actually a file (not a directory)
        if not os.path.isfile(abs_pdf_path):
            return f"Error: Path is not a file: {abs_pdf_path}"
        
        # Check if it's a PDF file
        if not abs_pdf_path.lower().endswith('.pdf'):
            return f"Error: File is not a PDF: {abs_pdf_path}"
        
        # pages 파라미터 처리
        if not pages or pages.strip() == "":
            # 모든 페이지 읽기
            md_text = pymupdf4llm.to_markdown(abs_pdf_path)
        elif "," in pages:
            # 쉼표로 구분된 페이지 리스트 (예: "1,3,5")
            page_numbers = [int(p.strip()) for p in pages.split(",")]
            page_list = [p-1 for p in page_numbers]  # 0-based indexing
            md_text = pymupdf4llm.to_markdown(abs_pdf_path, pages=page_list)
        elif "-" in pages:
            # 페이지 범위 (예: "2-6")
            start, end = map(int, pages.split("-"))
            page_list = list(range(start-1, end))  # 0-based indexing
            md_text = pymupdf4llm.to_markdown(abs_pdf_path, pages=page_list)
        else:
            # 단일 페이지 (예: "4")
            page_num = int(pages) - 1  # 0-based indexing
            md_text = pymupdf4llm.to_markdown(abs_pdf_path, pages=[page_num])
        
        return md_text
    
    except FileNotFoundError:
        return f"Error: PDF file not found: {os.path.abspath(pdf_path)}"
    except ValueError as e:
        return f"Error: Invalid page format: {pages}. Valid formats: '4', '2-6', '1,3,5'"
    except Exception as e:
        return f"Error during PDF conversion: {str(e)}"

if __name__ == "__main__":
    # MCP 서버 실행
    mcp.run(transport='stdio')