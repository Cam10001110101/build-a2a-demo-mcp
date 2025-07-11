# KV Namespaces for A2A Cloudflare Workers

## Created Namespaces

### MCP Registry Namespaces
- **AGENT_CARDS** (existing)
  - ID: `32cdf80ff9174c20a52095a19e61274b`
  - Preview ID: _needs to be retrieved_

- **EMBEDDINGS**
  - ID: `90dc33d0ba4845cdb4d8f78ae43d6483`
  - Preview ID: `593f8ea1366442339f4627ce895c13a5`

### Orchestrator Namespaces
- **SESSIONS**
  - ID: `30b704a797c44285bbebd48450168cfe`
  - Preview ID: `e48a96092e124abca738de637fa1f019`

- **WORKFLOWS**
  - ID: `0beca11ca7304af18f21cd7dc8d5a685`
  - Preview ID: `2af41ffd4e884dc2b309f46afb2566b7`

### Booking Agent Namespaces
- **PLANNER_BOOKINGS**
  - ID: `771cab81b4144c04a3a66ee129085f99`
  - Preview ID: `b8d99df932b84d688bb104fa029534d8`

- **AIR_TICKETS_BOOKINGS**
  - ID: `b320e1be38d849e2a2453c0e06c37e68`
  - Preview ID: `2743412349904df4bb14246cb7aacf80`

- **HOTELS_BOOKINGS**
  - ID: `de06a383a8ed440cbde8fa1d2ff6cb33`
  - Preview ID: `2fad8c0c15594bdf829e5baceaa0e8e6`

- **CAR_RENTAL_BOOKINGS**
  - ID: `daac7c09529c4adcb215282e3cb959ff`
  - Preview ID: `9a590daaedca48ef9da037d2723167a4`

## Wrangler Configuration Examples

### For MCP Registry (`mcp-registry/wrangler.toml`)
```toml
kv_namespaces = [
  { binding = "AGENT_CARDS", id = "32cdf80ff9174c20a52095a19e61274b" },
  { binding = "EMBEDDINGS", id = "90dc33d0ba4845cdb4d8f78ae43d6483", preview_id = "593f8ea1366442339f4627ce895c13a5" }
]
```

### For Orchestrator (`orchestrator/wrangler.toml`)
```toml
kv_namespaces = [
  { binding = "SESSIONS", id = "30b704a797c44285bbebd48450168cfe", preview_id = "e48a96092e124abca738de637fa1f019" },
  { binding = "WORKFLOWS", id = "0beca11ca7304af18f21cd7dc8d5a685", preview_id = "2af41ffd4e884dc2b309f46afb2566b7" }
]
```

### For Planner Agent (`planner/wrangler.toml`)
```toml
kv_namespaces = [
  { binding = "PLANNER_BOOKINGS", id = "771cab81b4144c04a3a66ee129085f99", preview_id = "b8d99df932b84d688bb104fa029534d8" }
]
```

### For Air Tickets Agent (`air-tickets/wrangler.toml`)
```toml
kv_namespaces = [
  { binding = "AIR_TICKETS_BOOKINGS", id = "b320e1be38d849e2a2453c0e06c37e68", preview_id = "2743412349904df4bb14246cb7aacf80" }
]
```

### For Hotels Agent (`hotels/wrangler.toml`)
```toml
kv_namespaces = [
  { binding = "HOTELS_BOOKINGS", id = "de06a383a8ed440cbde8fa1d2ff6cb33", preview_id = "2fad8c0c15594bdf829e5baceaa0e8e6" }
]
```

### For Car Rental Agent (`car-rental/wrangler.toml`)
```toml
kv_namespaces = [
  { binding = "CAR_RENTAL_BOOKINGS", id = "daac7c09529c4adcb215282e3cb959ff", preview_id = "9a590daaedca48ef9da037d2723167a4" }
]
```

## Commands Used

```bash
# Create production namespaces
wrangler kv namespace create "EMBEDDINGS"
wrangler kv namespace create "SESSIONS"
wrangler kv namespace create "WORKFLOWS"
wrangler kv namespace create "PLANNER_BOOKINGS"
wrangler kv namespace create "AIR_TICKETS_BOOKINGS"
wrangler kv namespace create "HOTELS_BOOKINGS"
wrangler kv namespace create "CAR_RENTAL_BOOKINGS"

# Create preview namespaces
wrangler kv namespace create "EMBEDDINGS" --preview
wrangler kv namespace create "SESSIONS" --preview
wrangler kv namespace create "WORKFLOWS" --preview
wrangler kv namespace create "PLANNER_BOOKINGS" --preview
wrangler kv namespace create "AIR_TICKETS_BOOKINGS" --preview
wrangler kv namespace create "HOTELS_BOOKINGS" --preview
wrangler kv namespace create "CAR_RENTAL_BOOKINGS" --preview
```