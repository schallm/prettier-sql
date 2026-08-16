create external model m1
with (
  location = 'https://foo.openai.azure.com/',
  api_format = 'Azure OpenAI',
  model_type = embeddings,
  model = 'text-embedding-ada-002',
  credential = my_cred
);

create external model m2 authorization dbo
with (
  location = 'https://foo/',
  api_format = 'Azure OpenAI',
  model_type = embeddings,
  model = 'x',
  credential = c,
  parameters = '{"dim":1536}'
);

alter external model m1
set (
  location = 'https://foo/',
  api_format = 'Azure OpenAI',
  model_type = embeddings,
  model = 'x',
  credential = c
);

drop external model m1;
