# Phoneflow - The Open Source Voice Agent Platform

Build voice agents by connecting nodes, deploy them to handle inbound and outbound phone calls, and monitor every call and its cost.

[<img src="https://img.youtube.com/vi/2oKsQKwafv4/sddefault.jpg" alt="Video" style="width: 100%;">](https://www.youtube.com/watch?v=2oKsQKwafv4 "Watch the video")

## Features

- **Visual flow builder**: Build agents as a graph of nodes and edges by connecting them on a canvas. The conversation starts at the start node and branches through different paths based on transition conditions. Each node carries a prompt, each edge defines a condition that moves the conversation forward when met.
- **Provider, model and voice selection**: Mix and match STT, LLM and TTS providers, models and voices, with the price per minute shown for each option.
- **Dynamic variables**: A lightweight templating engine lets you parameterize prompts and fill in values at runtime.
- **In-editor testing**: Test your agents as you iterate right from the editor side panel.
- **Version control**: Publish immutable agent versions so you can iterate with confidence, switch between versions, and roll back at any time.
- **Phone numbers**: Import numbers from any provider (Twilio, Telnyx, Zadarma, …) by filling in the number and its SIP credentials.
- **Inbound and outbound calls**: Route incoming calls to a chosen agent and version, and trigger outbound calls to any number with any agent and version.
- **Knowledge bases**: Upload text and Markdown documents and let agents look them up in real time during a call, with per-node selection and a search box to test retrieval.
- **Call monitoring**: Watch every call in real time with visibility into start time, duration, cost (broken down by model), channel (phone or web), direction (inbound or outbound), from/to numbers, and the agent and version that answered.

## Self-hosting requirements

Phoneflow needs Postgres with the [pgvector](https://github.com/pgvector/pgvector) extension, version 0.8 or newer. The stock `postgres` image doesn't include it, so use `pgvector/pgvector:pg17` or a managed Postgres that offers the extension. The repository doesn't ship a Postgres container: you point `DATABASE_URL` at your own server. Migrations run `CREATE EXTENSION IF NOT EXISTS vector`, so either the database user must be allowed to create extensions or the extension must already be installed. If it's already installed at an older version, upgrade it with `ALTER EXTENSION vector UPDATE`.

Knowledge bases need an OpenAI-compatible embeddings endpoint. Set these variables on both `apps/api` and `apps/worker`:

| Variable | Description |
| --- | --- |
| `EMBEDDINGS_BASE_URL` | Base URL of the API, without `/embeddings`, for example `https://api.openai.com/v1` |
| `EMBEDDINGS_API_KEY` | API key. Leave it empty for local servers that don't use one |
| `EMBEDDINGS_MODEL` | A model that returns 1536 dimensions, for example `text-embedding-3-small` |

If they are unset, document uploads fail with a clear error and the rest of the platform keeps working. Changing the model or its dimension requires re-indexing every document.
