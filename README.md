# Veyra Vetting Bot
A Discord bot for handling the most commmon method of vetting for servers. 
This is not the id half of the system, this is a basic age vet because thats what most servers do for the better implementation see:
[Veyra Bot](https://github.com/Monkestation/Veyra-Bot)

## Features

- **Vetting Requests**: Users can submit vetting requests using their BYOND ckey
- **Private Vetting Channels**: Each request creates a private channel for secure document submission
- **Admin Controls**: Approve/deny buttons with automatic API updates
- **Status Tracking**: Users can check their vetting request status
- **Admin Dashboard**: List all pending vetting requests
- **Automatic Cleanup**: Channels are automatically deleted after processing
- **Duplicate Prevention**: Prevents multiple active requests per user
- **User Notifications**: Automatic DMs for approval/denial status


## Prerequisites

- Node.js 16.9.0 or higher
- A Discord application and bot token
- Access to a Veyra API instance
- Discord server with appropriate permissions

## Installation

1. Clone the repository:
```bash
git clone https://github.com/Monkestation/Veyra-Vet
cd veyra-vetting-bot
```

2. Install dependencies:
```bash
npm install
```

3. Copy the environment template:
```bash
cp .env.example .env
```

4. Configure your environment variables (see Configuration section)

5. Start the bot:
```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

## Configuration

### Environment Variables

Create a `.env` file in the project root with the following variables:

```env
# Discord Bot Configuration
DISCORD_BOT_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_application_client_id
DISCORD_GUILD_ID=your_discord_server_id
DISCORD_ADMIN_ROLE_ID=your_admin_role_id
DISCORD_VETTING_CATEGORY_ID=your_vetting_category_id

# Veyra API Configuration
VEYRA_API_BASE_URL=https://your-veyra-instance.com
VEYRA_API_USERNAME=your_api_username
VEYRA_API_PASSWORD=your_api_password
```

### Discord Setup

1. **Create Discord Application**:
   - Go to https://discord.com/developers/applications
   - Create a new application
   - Go to "Bot" section and create a bot
   - Copy the bot token for `DISCORD_BOT_TOKEN`
   - Copy the Application ID for `DISCORD_CLIENT_ID`

2. **Bot Permissions**:
   The bot requires the following permissions:
   - Send Messages
   - Use Slash Commands
   - Manage Channels
   - View Channels
   - Read Message History
   - Send Messages in Threads

3. **Server Setup**:
   - Create a category for vetting channels
   - Create an admin role for vetting permissions
   - Get the server ID for `DISCORD_GUILD_ID`
   - Get the category ID for `DISCORD_VETTING_CATEGORY_ID`
   - Get the admin role ID for `DISCORD_ADMIN_ROLE_ID`

4. **Invite Bot**:
   Generate an invite URL with the required permissions and add the bot to your server.

### Veyra API Setup

Ensure your Veyra API instance is configured with:
- Authentication endpoint: `/api/auth/login`
- Verification lookup endpoint: `/api/v1/verify/ckey/{ckey}`
- Verification creation endpoint: `/api/v1/verify`

## Usage

### User Commands

- **`/vet <ckey>`**: Submit a new vetting request
  - Creates a private channel for document submission
  - Prevents duplicate requests
  - Checks if ckey is already verified

- **`/vetstatus`**: Check the status of your current vetting request
  - Shows request details and current status
  - Displays creation time and channel link

### Admin Commands

- **`/vetlist`**: List all pending vetting requests (Admin only)
  - Shows overview of all pending requests
  - Includes user names, ckeys, and channel links

### Admin Actions

Administrators can use the approve/deny buttons in vetting channels to:
- **Approve**: Marks user as age-vetted in Veyra API and notifies user
- **Deny**: Rejects the request and notifies user (allows resubmission)

## Workflow

1. **User Request**: User runs `/vet <ckey>` command
2. **Channel Creation**: Bot creates private vetting channel
3. **Document Submission**: User uploads age verification documents
4. **Admin Review**: Admins review documents and click approve/deny
5. **API Update**: Bot updates Veyra backend with verification status
6. **Notification**: User receives DM about decision
7. **Cleanup**: Channel is automatically deleted after processing

## Security Features

- Private channels with restricted permissions
- Admin-only approval/denial capabilities
- Automatic duplicate request prevention
- User data protection through channel cleanup, aswell as Veyra's Minimal Data Retention
