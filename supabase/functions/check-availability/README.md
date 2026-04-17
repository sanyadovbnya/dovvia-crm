# check-availability

Vapi tool-call endpoint. Given `{ date: "YYYY-MM-DD" }`, replies with open/booked status for the four 2-hour slots (10–12, 12–2, 2–4, 4–6) for the calling assistant's owning user.

## Setup (one-time)

1. **Run the migration** at `supabase/migrations/0002_profiles_assistant_id.sql`, then uncomment the `UPDATE` at the bottom and run it with your Supabase auth user id.

2. **Deploy the function:**
   ```
   supabase functions deploy check-availability --no-verify-jwt
   ```
   `--no-verify-jwt` is required because Vapi won't send a Supabase JWT.

3. **Copy the invocation URL** — `https://<project-ref>.supabase.co/functions/v1/check-availability`.

## Vapi tool config

In Vapi dashboard → Max → **Tools** → **+ Create Tool** → Function:

- **Name:** `check_availability`
- **Description:** "Check which 2-hour appointment slots are open on a given date. Call this BEFORE offering a time to the caller."
- **Parameters:**
  ```json
  {
    "type": "object",
    "properties": {
      "date": {
        "type": "string",
        "description": "The date the caller wants, in strict YYYY-MM-DD format. Resolve words like 'tomorrow' using the current date in the system prompt."
      }
    },
    "required": ["date"]
  }
  ```
- **Server URL:** paste the edge function URL from step 3.
- Attach the tool to Max.

## System prompt snippet

Add to Max's system prompt (replace existing Step 4 if present):

```
## Step 4 — Check availability and book
Once you know what day the caller wants:
1. Call the `check_availability` tool with the date in YYYY-MM-DD format.
2. When it returns, only offer the slots marked "open".
3. Never offer a slot marked "booked".
4. If the whole day is booked, suggest the next business day and call the tool again.

After the caller confirms a slot, proceed to Step 5 (verify and wrap up).
```
