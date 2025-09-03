require('dotenv').config();
const VettingBot = require('./VettingBot');

// Configuration object using environment variables
const config = {
  discord: {
    token: process.env.DISCORD_BOT_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    guildId: process.env.DISCORD_GUILD_ID,
    adminRoleId: process.env.DISCORD_ADMIN_ROLE_ID,
    vettingCategoryId: process.env.DISCORD_VETTING_CATEGORY_ID
  },
  veyra: {
    baseUrl: process.env.VEYRA_API_BASE_URL,
    username: process.env.VEYRA_API_USERNAME,
    password: process.env.VEYRA_API_PASSWORD
  }
};

// Validate required environment variables
const requiredEnvVars = [
  'DISCORD_BOT_TOKEN',
  'DISCORD_CLIENT_ID', 
  'DISCORD_GUILD_ID',
  'DISCORD_ADMIN_ROLE_ID',
  'DISCORD_VETTING_CATEGORY_ID',
  'VEYRA_API_BASE_URL',
  'VEYRA_API_USERNAME',
  'VEYRA_API_PASSWORD'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error('Missing required environment variables:', missingVars.join(', '));
  console.error('Please check your .env file and ensure all required variables are set.');
  process.exit(1);
}

// Initialize and start the bot
const bot = new VettingBot(config);

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  await bot.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  await bot.shutdown();
  process.exit(0);
});

// Start the bot
bot.start().catch(error => {
  console.error('Failed to start the vetting bot:', error);
  process.exit(1);
});