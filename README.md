# Agent-to-Agent (A2A) with MCP Registry Demo

This repository demonstrates how to use the Model Context Protocol (MCP) as an agent registry for multi-agent travel planning. The system features **MCP 2025-06-18 compliance** with protocol version validation, session management, and modern transport capabilities.

**🌟 Production Deployment**: Fully operational Cloudflare Workers deployment at `https://agent.*.demos.build`

See [quickstart](./docs/quickstart.md) for setup and usage instructions.

**🎥 Learn More**: Subscribe to The Build Podcast: https://www.youtube.com/channel/UCD1O1mlBGXBMXN-dmNfgDkg


# Architecture Overview

This repository contains two implementations:

## 🚀 **Primary: Cloudflare Workers** (Production Ready)
- **MCP 2025-06-18 compliant** registry with protocol version validation
- Deployed on Cloudflare's edge network with custom domains
- Multi-agent travel planning with vector-based agent discovery
- Workers AI for embeddings, D1 for travel data, KV for agent cards

## 🐍 **Alternative: Python** (Development/Testing)
- Local development and testing implementation
- Compatible with the A2A Protocol specification
- Useful for experimentation and learning

## Key Features
- **Agent Discovery**: Vector similarity search using AI embeddings
- **Travel Planning**: Multi-agent coordination for flights, hotels, car rentals
- **MCP Compliance**: Full Model Context Protocol 2025-06-18 support
- **Real-time Communication**: SSE transport for streaming responses
- **Session Management**: Proper initialization and lifecycle handling

## Related Repositories

- [A2A](https://github.com/a2aproject/A2A) - A2A Specification and documentation.
- [a2a-python](https://github.com/a2aproject/a2a-python) - A2A Python SDK.
- [a2a-inspector](https://github.com/a2aproject/a2a-inspector) - UI tool for inspecting A2A enabled agents.

## Contributing

Contributions welcome! See the [Contributing Guide](CONTRIBUTING.md).

## Getting help

Please use the [issues page](https://github.com/a2aproject/a2a-samples/issues) to provide suggestions, feedback or submit a bug report.

## Disclaimer

This repository itself is not an officially supported Google product. The code in this repository is for demonstrative purposes only.

Important: The sample code provided is for demonstration purposes and illustrates the mechanics of the Agent-to-Agent (A2A) protocol. When building production applications, it is critical to treat any agent operating outside of your direct control as a potentially untrusted entity.

All data received from an external agent—including but not limited to its AgentCard, messages, artifacts, and task statuses—should be handled as untrusted input. For example, a malicious agent could provide an AgentCard containing crafted data in its fields (e.g., description, name, skills.description). If this data is used without sanitization to construct prompts for a Large Language Model (LLM), it could expose your application to prompt injection attacks.  Failure to properly validate and sanitize this data before use can introduce security vulnerabilities into your application.

Developers are responsible for implementing appropriate security measures, such as input validation and secure handling of credentials to protect their systems and users.
