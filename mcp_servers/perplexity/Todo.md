## input 정의

- 모델 선택 (sonar, sonar-pro, sonar-reasoning, sonar-reasoning-pro, sonar-deep-research)
- user message(host에서 가공된)
- system message(host에서 가공된)

- search_mode(academic / web)
- reasoning_effort(low / medium / high) <- sonar-deep-reasearch모델에만 사용 가능.. 일단은 쓰지말자
- search_domain_filter
    ex: "search_domain_filter": [
        "<domain1>",
        "<domain2>",
        ...
        ]
- return_related_questons (true / false)
- search_after_date_filter(ex: 3/1/2025) -> 2025년 3월 1일 이후의 정보만 찾음
- response_format

## output 구조 및 사용할 정보

- response.choices[0].message.content
- search_results[]에서 title, url만

예시출력:

{
  id: 'e5916b70-574e-4681-9547-0211779e9f7d',
  model: 'sonar',
  created: 1753344051,
  usage: {
    prompt_tokens: 14,
    completion_tokens: 64,
    total_tokens: 78,
    search_context_size: 'low'
  },
  citations: [
    'https://www.esa.int/Science_Exploration/Space_Science/Herschel/How_many_stars_are_there_in_the_Universe',
    'https://www.astronomy.com/science/astro-for-kids-how-many-stars-are-there-in-space/',
    'https://www.youtube.com/watch?v=MTeyypxmbK0',
    'https://en.wikipedia.org/wiki/Milky_Way',
    'https://imagine.gsfc.nasa.gov/science/objects/milkyway1.html'
  ],
  search_results: [
    {
      title: 'How many stars are there in the Universe? - European Space Agency',
      url: 'https://www.esa.int/Science_Exploration/Space_Science/Herschel/How_many_stars_are_there_in_the_Universe',
      date: '2020-06-01',
      last_updated: '2025-06-16'
    },
    {
      title: 'Astro for kids: How many stars are there in space?',
      url: 'https://www.astronomy.com/science/astro-for-kids-how-many-stars-are-there-in-space/',
      date: '2021-09-28',
      last_updated: '2025-07-17'
    },
    {
      title: 'How Many Stars Are in the Universe!?!? - YouTube',
      url: 'https://www.youtube.com/watch?v=MTeyypxmbK0',
      date: '2025-05-14',
      last_updated: '2025-06-29'
    },
    {
      title: 'Milky Way - Wikipedia',
      url: 'https://en.wikipedia.org/wiki/Milky_Way',
      date: '2001-09-15',
      last_updated: '2025-07-19'
    },
    {
      title: 'Milky Way Galaxy - Imagine the Universe! - NASA',
      url: 'https://imagine.gsfc.nasa.gov/science/objects/milkyway1.html',
      date: '2015-07-22',
      last_updated: '2025-06-16'
    }
  ],
  object: 'chat.completion',
  choices: [
    {
      index: 0,
      finish_reason: 'stop',
      message: [Object],
      delta: [Object]
    }
  ]
}


