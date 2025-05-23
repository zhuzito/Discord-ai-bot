require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const { OpenAI } = require("openai");
const fs = require("fs");
const path = require("path");

// Initialize OpenAI with API key
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Initialize Discord client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// IDs loaded from environment
const SERVER_IDS = {
  server1: process.env.SERVER1_ID,
  server2: process.env.SERVER2_ID,
};

const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const ALLOWED_CATEGORY_ID = process.env.ALLOWED_CATEGORY_ID;

// Stats file
const statsFile = path.join(__dirname, "stats.json");

let stats = fs.existsSync(statsFile)
  ? JSON.parse(fs.readFileSync(statsFile))
  : {};

function saveStats() {
  fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
}

// Bot startup log
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// Message handler
client.on("messageCreate", async (message) => {
  // Ignore bot messages or DMs
  if (message.author.bot || !message.guild) return;

  const serverId = message.guild.id;
  const serverName = Object.keys(SERVER_IDS).find(
    (key) => SERVER_IDS[key] === serverId,
  );

  if (!serverName) return;

  const content = message.content.trim();

  // Handle commands
  if (content.startsWith("!")) {
    if (content.startsWith("!stats")) {
      const [, targetName] = content.split(" ");
      const target = targetName || serverName;

      const { inputs = 0, tokens = 0 } = stats[target] || {};
      return message.reply(
        `📊 Stats for \`${target}\` — Inputs: ${inputs}, Tokens: ${tokens}`,
      );
    }

    if (content === "!reset-daily" || content === "!reset-monthly") {
      stats[serverName] = { inputs: 0, tokens: 0 };
      saveStats();
      return message.reply("✅ Stats have been reset.");
    }

    return;
  }

  // Enforce category
  if (message.channel.parentId !== ALLOWED_CATEGORY_ID) return;

  // Track stats
  stats[serverName] = stats[serverName] || { inputs: 0, tokens: 0 };
  stats[serverName].inputs++;
  saveStats();

  try {
    // OpenAI API call
    const response = await openai.chat.completions.create({
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: message.content },
      ],
      model: "gpt-3.5-turbo",
    });

    const reply = response.choices[0].message.content;
    await message.reply(reply);

    // Track token usage
    if (response.usage) {
      stats[serverName].tokens += response.usage.total_tokens;
      saveStats();
    }

    // Log stats to channel
    try {
      const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
      if (logChannel?.isTextBased()) {
        logChannel.send(
          `📨 \`${serverName}\` — Inputs: ${stats[serverName].inputs} | Tokens: ${stats[serverName].tokens}`,
        );
      }
    } catch (err) {
      console.error("Logging failed:", err);
    }
  } catch (err) {
    console.error("OpenAI error:", err);
    message.reply("❌ Something went wrong with the AI.");
  }
});

// Login
client.login(process.env.DISCORD_TOKEN);
