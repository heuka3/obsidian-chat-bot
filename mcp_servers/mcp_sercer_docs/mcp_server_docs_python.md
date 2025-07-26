# Quickstart: Building an MCP Server (Python)

This guide explains how to create a simple Model Context Protocol (MCP) server in Python that exposes weather-related tools for use by LLMs. You’ll learn the core steps, required code, and essential concepts—up to running your server locally.

---

## 1. What is an MCP Server?

An MCP server is a program that provides tools (functions) or resources (data) that can be called by large language models (LLMs) like Claude. In this example, your server will let an LLM fetch weather alerts and forecasts using the US National Weather Service API.

---

## 2. Prerequisites

- Python 3.10 or higher installed.
- Basic understanding of Python and LLMs.
- Python MCP SDK version 1.2.0 or higher.

---

## 3. Environment Setup

First, install the `uv` package manager and set up your project:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Restart your terminal so the `uv` command is available.

Create a new project directory and set up the environment:

```bash
uv init weather
cd weather

uv venv
source .venv/bin/activate

uv add "mcp[cli]" httpx

touch weather.py
```

---

## 4. Writing the Server Code

Open `weather.py` and add the following code step by step.

### a. Import Packages and Initialize Server

```python
from typing import Any
import httpx
from mcp.server.fastmcp import FastMCP

# Initialize FastMCP server
mcp = FastMCP("weather")

# Constants
NWS_API_BASE = "https://api.weather.gov"
USER_AGENT = "weather-app/1.0"
```

### b. Helper Functions

These help fetch and format weather data:

```python
async def make_nws_request(url: str) -> dict[str, Any] | None:
    """Make a request to the NWS API with proper error handling."""
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/geo+json"
    }
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, headers=headers, timeout=30.0)
            response.raise_for_status()
            return response.json()
        except Exception:
            return None

def format_alert(feature: dict) -> str:
    """Format an alert feature into a readable string."""
    props = feature["properties"]
    return f"""
Event: {props.get('event', 'Unknown')}
Area: {props.get('areaDesc', 'Unknown')}
Severity: {props.get('severity', 'Unknown')}
Description: {props.get('description', 'No description available')}
Instructions: {props.get('instruction', 'No specific instructions provided')}
"""
```

### c. Define Tools

These are the functions the LLM can call:

```python
@mcp.tool()
async def get_alerts(state: str) -> str:
    """Get weather alerts for a US state.

    Args:
        state: Two-letter US state code (e.g. CA, NY)
    """
    url = f"{NWS_API_BASE}/alerts/active/area/{state}"
    data = await make_nws_request(url)

    if not data or "features" not in data:
        return "Unable to fetch alerts or no alerts found."

    if not data["features"]:
        return "No active alerts for this state."

    alerts = [format_alert(feature) for feature in data["features"]]
    return "\n---\n".join(alerts)

@mcp.tool()
async def get_forecast(latitude: float, longitude: float) -> str:
    """Get weather forecast for a location.

    Args:
        latitude: Latitude of the location
        longitude: Longitude of the location
    """
    # First get the forecast grid endpoint
    points_url = f"{NWS_API_BASE}/points/{latitude},{longitude}"
    points_data = await make_nws_request(points_url)

    if not points_data:
        return "Unable to fetch forecast data for this location."

    # Get the forecast URL from the points response
    forecast_url = points_data["properties"]["forecast"]
    forecast_data = await make_nws_request(forecast_url)

    if not forecast_data:
        return "Unable to fetch detailed forecast."

    # Format the periods into a readable forecast
    periods = forecast_data["properties"]["periods"]
    forecasts = []
    for period in periods[:5]:  # Only show next 5 periods
        forecast = f"""
{period['name']}:
Temperature: {period['temperature']}°{period['temperatureUnit']}
Wind: {period['windSpeed']} {period['windDirection']}
Forecast: {period['detailedForecast']}
"""
        forecasts.append(forecast)

    return "\n---\n".join(forecasts)
```

### d. Run the Server

Add this to the end of `weather.py`:

```python
if __name__ == "__main__":
    mcp.run(transport='stdio')
```

---

## 5. Start Your Server

Run the following command in your project directory:

```bash
uv run weather.py
```

If everything is correct, your MCP server is now running and ready to provide weather information to any compatible client.