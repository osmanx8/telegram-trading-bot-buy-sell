import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import * as dotenv from "dotenv";
import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount, NATIVE_MINT } from "@solana/spl-token";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
dotenv.config();

const connection = new Connection(process.env.RPC_URL!, "confirmed");
const wallet = Keypair.fromSecretKey(bs58.decode(process.env.WALLET_PRIVATEKEY!));

// Types for user data
interface UserData {
  token?: string;
  sol_balance: number;
  token_balance: number;
  step: "idle" | "awaiting_wallet" | "awaiting_buy" | "awaiting_sell";
}

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, { polling: true });
// Set bot commands
bot.setMyCommands([
  { command: 'start', description: 'Start the bot and see welcome message' },
  { command: 'balance', description: 'Check your SOL and token balances' },
  { command: 'buy', description: 'Buy tokens with SOL' },
  { command: 'sell', description: 'Sell tokens for SOL' },
  { command: 'help', description: 'Show help information' }
]);

// Buy command
bot.onText(/\/buy/, async (msg) => {
  const userId = msg.from!.id;
  if (!users[userId]?.token) {
    bot.sendMessage(userId, "Please set a token address first using /start", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "➕ Add New Token", callback_data: "add_token" }],
          [{ text: "❓ Help", callback_data: "help" }]
        ]
      }
    });
    return;
  }

  const sol_balance = await connection.getBalance(wallet.publicKey);
  const formatted_balance = (sol_balance / 1e9).toFixed(2);

  bot.sendMessage(
    userId,
    `Current SOL Balance: ${formatted_balance}\nSelect amount to spend:`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "0.1 SOL", callback_data: "buy_0.1" },
            { text: "0.2 SOL", callback_data: "buy_0.2" },
          ],
          [
            { text: "0.5 SOL", callback_data: "buy_0.5" },
            { text: "1 SOL", callback_data: "buy_1" },
          ],
          [
            { text: "2 SOL", callback_data: "buy_2" },
            { text: "5 SOL", callback_data: "buy_5" },
          ],
          [{ text: "❌ Cancel", callback_data: "cancel" }],
          [{ text: "📊 Check Balance", callback_data: "check_balance" }]
        ]
      }
    }
  );
});

// Sell command
bot.onText(/\/sell/, async (msg) => {
  const userId = msg.from!.id;
  if (!users[userId]?.token) {
    bot.sendMessage(userId, "Please set a token address first using /start", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "➕ Add New Token", callback_data: "add_token" }],
          [{ text: "❓ Help", callback_data: "help" }]
        ]
      }
    });
    return;
  }
  
  const token_balance = await getTokenBalance(wallet.publicKey, new PublicKey(users[userId].token!));
  users[userId].token_balance = token_balance;

  if (token_balance <= 0) {
    bot.sendMessage(userId, "You don't have any tokens to sell", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "💰 Buy Tokens", callback_data: "buy" }],
          [{ text: "📊 Check Balance", callback_data: "check_balance" }]
        ]
      }
    });
    return;
  }

  bot.sendMessage(
    userId,
    `Current token balance: ${token_balance}\nChoose the percentage to sell:`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "20%", callback_data: "sell_20" },
            { text: "50%", callback_data: "sell_50" },
          ],
          [
            { text: "70%", callback_data: "sell_70" },
            { text: "100%", callback_data: "sell_100" },
          ],
          [{ text: "❌ Cancel", callback_data: "cancel" }]
        ]
      }
    }
  );
});

// Help command
bot.onText(/\/help/, (msg) => {
  const userId = msg.from!.id;
  bot.sendMessage(
    userId,
    "🤖 Bot Commands Help:\n\n" +
    "/start - Initialize the bot and set token address\n" +
    "/balance - Check your SOL and token balances\n" +
    "/buy - Start the process to buy tokens\n" +
    "/sell - Start the process to sell tokens\n" +
    "/help - Show this help message\n\n" +
    "📝 Instructions:\n" +
    "1. Use /start to begin and set your token\n" +
    "2. Use /balance to check your balances\n" +
    "3. Use /buy or /sell to trade tokens\n\n" +
    "❓ Need more help? Use the buttons below.",
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🚀 Start Bot", callback_data: "start" },
            { text: "📊 Check Balance", callback_data: "check_balance" }
          ],
          [
            { text: "💰 Buy", callback_data: "buy" },
            { text: "💸 Sell", callback_data: "sell" }
          ],
          [{ text: "➕ Add New Token", callback_data: "add_token" }]
        ]
      }
    }
  );
});

// Simple in-memory storage
const users: Record<number, UserData> = {};

// Start command
bot.onText(/\/start/, async (msg) => {
  const userId = msg.from!.id;
  const balance = await connection.getBalance(wallet.publicKey);
  users[userId] = {
    sol_balance: balance,
    token_balance: 0,
    step: "awaiting_wallet",
  };
  bot.sendMessage(
    userId,
    "👋 Welcome to the Solana Token Buy/Sell Bot!\n\n" +
      "To get started, please enter the token address you want to trade.\n\n" +
      "ℹ️ You can find token addresses on sites like Solscan or SolanaFM.\n\n" +
      "💡 Note: This bot is for educational purposes only. Use at your own risk!\n\n" +
      "🔑 Your wallet address: " +
      wallet.publicKey.toString() +
      "\n\n" +
      "💰 Your balance: " +
      balance / 10 ** 9 +
      " SOL" +
      "\n\n" +
      "🔄 Available commands:\n\n" +
      "• Buy and sell tokens\n" +
      "• Check your token and SOL balances\n" +
      "• Add new tokens to track\n" +
      "• Remove tokens you no longer want to track\n\n" +
      "Use the buttons below to get started! 👇",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "➕ Add New Token", callback_data: "add_token" }],
          [
            { text: "💰 Buy Token", callback_data: "buy" },
            { text: "💸 Sell Token", callback_data: "sell" }
          ],
          [{ text: "📊 Check Balance", callback_data: "check_balance" }],
          [{ text: "❓ Help", callback_data: "help" }]
        ]
      }
    }
  );
});

// Handle text messages (wallet setup, buy, and sell)
bot.on("message", async (msg) => {
  const userId = msg.from!.id;
  const user = users[userId] || {
    sol_balance: 0,
    token_balance: 0,
    step: "idle",
  };

  if (user.step === "awaiting_wallet") {
    try {
      // Validate token address
      new PublicKey(msg.text!);
      user.token = msg.text!;
      user.step = "idle";
      return bot.sendMessage(userId, "✅ Token address saved! What would you like to do?", {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "💰 Buy Token", callback_data: "buy" },
              { text: "💸 Sell Token", callback_data: "sell" }
            ],
            [{ text: "📊 Check Balance", callback_data: "check_balance" }],
            [{ text: "➕ Change Token", callback_data: "add_token" }]
          ]
        }
      });
    } catch (error) {
      return bot.sendMessage(userId, "❌ Invalid token address. Please try again:", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "❌ Cancel", callback_data: "cancel" }],
            [{ text: "❓ Help", callback_data: "help" }]
          ]
        }
      });
    }
  }

  if (user.step === "awaiting_buy") {
    const amount = parseFloat(msg.text!);
    if (isNaN(amount)) {
      return bot.sendMessage(userId, "❌ Please send a valid number", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "❌ Cancel", callback_data: "cancel" }],
            [{ text: "📊 Check Balance", callback_data: "check_balance" }]
          ]
        }
      });
    }

    if (!user.token) {
      return bot.sendMessage(userId, "❌ You need to set up your wallet first!", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "➕ Add New Token", callback_data: "add_token" }],
            [{ text: "❓ Help", callback_data: "help" }]
          ]
        }
      });
    }

    const token_balance = await getTokenBalance(wallet.publicKey, new PublicKey(user.token!));
    const sol_balance = await connection.getBalance(wallet.publicKey);
    user.token_balance = token_balance;
    user.sol_balance = sol_balance;

    if (user.sol_balance < amount * 1e9) {
      return bot.sendMessage(userId, "❌ You don't have enough SOL to buy this amount!", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📊 Check Balance", callback_data: "check_balance" }],
            [{ text: "❌ Cancel", callback_data: "cancel" }]
          ]
        }
      });
    }

    try {
      await buyCrypto(user.token, amount * 1e9);
      user.step = "idle";
      user.token_balance = await getTokenBalance(wallet.publicKey, new PublicKey(user.token!));
      user.sol_balance = await connection.getBalance(wallet.publicKey);
      return bot.sendMessage(userId, `✅ Successfully swapped ${amount} SOL!`, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "💰 Buy More", callback_data: "buy" },
              { text: "💸 Sell", callback_data: "sell" }
            ],
            [{ text: "📊 Check Balance", callback_data: "check_balance" }]
          ]
        }
      });
    } catch (error: any) {
      return bot.sendMessage(userId, `❌ Error: ${error.message}`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Try Again", callback_data: "buy" }],
            [{ text: "❌ Cancel", callback_data: "cancel" }]
          ]
        }
      });
    }
  }
}); 

// Buy handler
bot.onText(/💰 Buy Token/, (msg) => {
  const userId = msg.from!.id;
  users[userId].step = "awaiting_buy";
  return bot.sendMessage(userId, "Enter the amount of SOL to swap:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "❌ Cancel", callback_data: "cancel" }],
        [{ text: "📊 Check Balance", callback_data: "check_balance" }]
      ]
    }
  });
});

// Balance command
bot.onText(/\/balance/, async (msg) => {
  const userId = msg.from!.id;
  const user = users[userId];
  
  if (!user?.token) {
    return bot.sendMessage(userId, "Please set a token address first", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "➕ Add New Token", callback_data: "add_token" }],
          [{ text: "❓ Help", callback_data: "help" }]
        ]
      }
    });
  }

  const token_balance = await getTokenBalance(wallet.publicKey, new PublicKey(user.token));
  const sol_balance = await connection.getBalance(wallet.publicKey);
  user.token_balance = token_balance;
  user.sol_balance = sol_balance;
  
  return bot.sendMessage(
    userId, 
    `💰 Your Balances:\n\n` +
    `SOL: ${(sol_balance / 1e9).toFixed(4)}\n` +
    `Token: ${token_balance}`, 
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "💰 Buy", callback_data: "buy" },
            { text: "💸 Sell", callback_data: "sell" }
          ],
          [{ text: "🔄 Refresh Balance", callback_data: "check_balance" }]
        ]
      }
    }
  );
});

bot.onText(/📊 Check Balance/, async (msg) => {
  const userId = msg.from!.id;
  const user = users[userId];
  
  if (!user?.token) {
    return bot.sendMessage(userId, "Please set a token address first", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "➕ Add New Token", callback_data: "add_token" }],
          [{ text: "❓ Help", callback_data: "help" }]
        ]
      }
    });
  }

  const token_balance = await getTokenBalance(wallet.publicKey, new PublicKey(user.token));
  const sol_balance = await connection.getBalance(wallet.publicKey);
  user.token_balance = token_balance;
  user.sol_balance = sol_balance;
  
  return bot.sendMessage(
    userId, 
    `💰 Your Balances:\n\n` +
    `SOL: ${(sol_balance / 1e9).toFixed(4)}\n` +
    `Token: ${token_balance}`, 
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "💰 Buy", callback_data: "buy" },
            { text: "💸 Sell", callback_data: "sell" }
          ],
          [{ text: "🔄 Refresh Balance", callback_data: "check_balance" }]
        ]
      }
    }
  );
});

// Sell handler
bot.onText(/💸 Sell Token/, async (msg) => {
  const userId = msg.from!.id;
  if (!users[userId]) {
    users[userId] = { sol_balance: 0, token_balance: 0, step: "idle" };
  }
  const user = users[userId];

  if (!user.token) {
    return bot.sendMessage(userId, "❌ Please add a token first", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "➕ Add New Token", callback_data: "add_token" }],
          [{ text: "❓ Help", callback_data: "help" }]
        ]
      }
    });
  }

  const token_balance = await getTokenBalance(wallet.publicKey, new PublicKey(user.token));
  const sol_balance = await connection.getBalance(wallet.publicKey);
  user.token_balance = token_balance;
  user.sol_balance = sol_balance;

  if (user.token_balance <= 0) {
    return bot.sendMessage(userId, "❌ You don't have any tokens to sell", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "💰 Buy Tokens", callback_data: "buy" }],
          [{ text: "📊 Check Balance", callback_data: "check_balance" }]
        ]
      }
    });
  }

  return bot.sendMessage(userId, `Current token balance: ${user.token_balance}\nChoose the percentage to sell:`, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "20%", callback_data: "sell_20" },
          { text: "50%", callback_data: "sell_50" },
        ],
        [
          { text: "70%", callback_data: "sell_70" },
          { text: "100%", callback_data: "sell_100" },
        ],
        [{ text: "❌ Cancel", callback_data: "cancel" }]
      ],
    },
  });
});

bot.onText(/➕ Add New Token/, (msg) => {
  const userId = msg.from!.id;
  if (!users[userId]) {
    users[userId] = { sol_balance: 0, token_balance: 0, step: "idle" };
  }
  const user = users[userId];
  user.step = "awaiting_wallet";
  bot.sendMessage(userId, "Please enter the token address:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "❌ Cancel", callback_data: "cancel" }],
        [{ text: "❓ Help", callback_data: "help" }]
      ]
    }
  });
});

// Handle Callback Queries
bot.on("callback_query", async (query) => {
  const userId = query.from!.id;
  if (!users[userId]) {
    users[userId] = { sol_balance: 0, token_balance: 0, step: "idle" };
  }
  const user = users[userId];
  const callbackData = query.data;

  if (!callbackData) {
    return bot.answerCallbackQuery(query.id, {
      text: "❌ Invalid callback data",
    });
  }

  if (callbackData.startsWith("buy_")) {
    const amount = parseFloat(callbackData.split("_")[1]);
    if (!user.token) {
      return bot.answerCallbackQuery(query.id, {
        text: "❌ Please set a token first",
      });
    }

    const sol_balance = await connection.getBalance(wallet.publicKey);
    if (sol_balance < amount * 1e9) {
      return bot.answerCallbackQuery(query.id, {
        text: "❌ Insufficient SOL balance",
      });
    }

    try {
      await buyCrypto(user.token, amount * 1e9);
      user.token_balance = await getTokenBalance(wallet.publicKey, new PublicKey(user.token));
      user.sol_balance = await connection.getBalance(wallet.publicKey);
      bot.answerCallbackQuery(query.id, {
        text: `✅ Successfully bought tokens with ${amount} SOL`,
      });
      return bot.editMessageText(`✅ Successfully swapped ${amount} SOL!`, {
        chat_id: query.message!.chat.id,
        message_id: query.message!.message_id,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "💰 Buy More", callback_data: "buy" },
              { text: "💸 Sell", callback_data: "sell" }
            ],
            [{ text: "📊 Check Balance", callback_data: "check_balance" }]
          ]
        }
      }).catch(error => {
        if (error.message.includes('message is not modified')) {
          // Ignore this error
          return;
        }
        throw error;
      });
    } catch (error: any) {
      return bot.answerCallbackQuery(query.id, {
        text: `❌ Error: ${error.message}`,
      });
    }
  }

  if (callbackData === "help") {
    try {
      return bot.editMessageText(
        "🤖 Bot Commands Help:\n\n" +
        "/start - Initialize the bot and set token address\n" +
        "/balance - Check your SOL and token balances\n" +
        "/buy - Start the process to buy tokens\n" +
        "/sell - Start the process to sell tokens\n" +
        "/help - Show this help message\n\n" +
        "📝 Instructions:\n" +
        "1. Use /start to begin and set your token\n" +
        "2. Use /balance to check your balances\n" +
        "3. Use /buy or /sell to trade tokens\n\n" +
        "❓ Need more help? Use the buttons below.",
        {
          chat_id: query.message!.chat.id,
          message_id: query.message!.message_id,
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🚀 Start Bot", callback_data: "start" },
                { text: "📊 Check Balance", callback_data: "check_balance" }
              ],
              [
                { text: "💰 Buy", callback_data: "buy" },
                { text: "💸 Sell", callback_data: "sell" }
              ],
              [{ text: "➕ Add New Token", callback_data: "add_token" }]
            ]
          }
        }
      ).catch(error => {
        if (error.message.includes('message is not modified')) {
          // Ignore this error
          return;
        }
        throw error;
      });
    } catch (error: any) {
      if (error.message.includes("message is not modified")) {
        return bot.answerCallbackQuery(query.id, {
          text: "No changes to display",
        });
      }
      throw error;
    }
  }

  if (callbackData === "start") {
    const balance = await connection.getBalance(wallet.publicKey);
    users[userId] = {
      sol_balance: balance,
      token_balance: 0,
      step: "awaiting_wallet",
    };
    try {
      return bot.editMessageText(
        "👋 Welcome to the Solana Token Buy/Sell Bot!\n\n" +
        "To get started, please enter the token address you want to trade.\n\n" +
        "ℹ️ You can find token addresses on sites like Solscan or SolanaFM.\n\n" +
        "💡 Note: This bot is for educational purposes only. Use at your own risk!\n\n" +
        "🔑 Your wallet address: " +
        wallet.publicKey.toString() +
        "\n\n" +
        "💰 Your balance: " +
        balance / 10 ** 9 +
        " SOL",
        {
          chat_id: query.message!.chat.id,
          message_id: query.message!.message_id,
          reply_markup: {
            inline_keyboard: [
              [{ text: "➕ Add New Token", callback_data: "add_token" }],
              [
                { text: "💰 Buy Token", callback_data: "buy" },
                { text: "💸 Sell Token", callback_data: "sell" }
              ],
              [{ text: "📊 Check Balance", callback_data: "check_balance" }],
              [{ text: "❓ Help", callback_data: "help" }]
            ]
          }
        }
      ).catch(error => {
        if (error.message.includes('message is not modified')) {
          // Ignore this error
          return;
        }
        throw error;
      });
    } catch (error: any) {
      if (error.message.includes("message is not modified")) {
        return bot.answerCallbackQuery(query.id, {
          text: "No changes to display",
        });
      }
      throw error;
    }
  }

  if (callbackData === "cancel") {
    user.step = "idle";
    try {
      return bot.editMessageText("Operation cancelled. What would you like to do?", {
        chat_id: query.message!.chat.id,
        message_id: query.message!.message_id,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "💰 Buy", callback_data: "buy" },
              { text: "💸 Sell", callback_data: "sell" }
            ],
            [{ text: "📊 Check Balance", callback_data: "check_balance" }],
            [{ text: "❓ Help", callback_data: "help" }]
          ]
        }
      }).catch(error => {
        if (error.message.includes('message is not modified')) {
          // Ignore this error
          return;
        }
        throw error;
      });
    } catch (error: any) {
      if (error.message.includes("message is not modified")) {
        return bot.answerCallbackQuery(query.id, {
          text: "No changes to display",
        });
      }
      throw error;
    }
  }

  if (callbackData === "buy" || callbackData === "buy_more") {
    const sol_balance = await connection.getBalance(wallet.publicKey);
    const formatted_balance = (sol_balance / 1e9).toFixed(2);
    
    try {
      return bot.editMessageText(`Current SOL Balance: ${formatted_balance}\nSelect amount to spend:`, {
        chat_id: query.message!.chat.id,
        message_id: query.message!.message_id,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "0.1 SOL", callback_data: "buy_0.1" },
              { text: "0.2 SOL", callback_data: "buy_0.2" },
            ],
            [
              { text: "0.5 SOL", callback_data: "buy_0.5" },
              { text: "1 SOL", callback_data: "buy_1" },
            ],
            [
              { text: "2 SOL", callback_data: "buy_2" },
              { text: "5 SOL", callback_data: "buy_5" },
            ],
            [{ text: "❌ Cancel", callback_data: "cancel" }],
            [{ text: "📊 Check Balance", callback_data: "check_balance" }]
          ]
        }
      }).catch(error => {
        if (error.message.includes('message is not modified')) {
          // Ignore this error
          return;
        }
        throw error;
      });
    } catch (error: any) {
      if (error.message.includes("message is not modified")) {
        return bot.answerCallbackQuery(query.id, {
          text: "No changes to display",
        });
      }
      throw error;
    }
  }

  if (callbackData === "check_balance") {
    if (!user.token) {
      try {
        return bot.editMessageText("Please set a token address first", {
          chat_id: query.message!.chat.id,
          message_id: query.message!.message_id,
          reply_markup: {
            inline_keyboard: [
              [{ text: "➕ Add New Token", callback_data: "add_token" }],
              [{ text: "❓ Help", callback_data: "help" }]
            ]
          }
        }).catch(error => {
          if (error.message.includes('message is not modified')) {
            // Ignore this error
            return;
          }
          throw error;
        });
      } catch (error: any) {
        if (error.message.includes("message is not modified")) {
          return bot.answerCallbackQuery(query.id, {
            text: "No changes to display",
          });
        }
        throw error;
      }
    }

    const token_balance = await getTokenBalance(wallet.publicKey, new PublicKey(user.token));
    const sol_balance = await connection.getBalance(wallet.publicKey);
    user.token_balance = token_balance;
    user.sol_balance = sol_balance;
    
    try {
      return bot.editMessageText(
        `💰 Your Balances:\n\n` +
        `SOL: ${(sol_balance / 1e9).toFixed(4)}\n` +
        `Token: ${token_balance}`,
        {
          chat_id: query.message!.chat.id,
          message_id: query.message!.message_id,
          reply_markup: {
            inline_keyboard: [
              [
                { text: "💰 Buy", callback_data: "buy" },
                { text: "💸 Sell", callback_data: "sell" }
              ],
              [{ text: "🔄 Refresh Balance", callback_data: "check_balance" }]
            ]
          }
        }
      ).catch(error => {
        if (error.message.includes('message is not modified')) {
          // Ignore this error
          return;
        }
        throw error;
      });
    } catch (error: any) {
      if (error.message.includes("message is not modified")) {
        return bot.answerCallbackQuery(query.id, {
          text: "No changes to display",
        });
      }
      throw error;
    }
  }

  if (callbackData === "add_token") {
    user.step = "awaiting_wallet";
    try {
      return bot.editMessageText("Please enter the token address:", {
        chat_id: query.message!.chat.id,
        message_id: query.message!.message_id,
        reply_markup: {
          inline_keyboard: [
            [{ text: "❌ Cancel", callback_data: "cancel" }],
            [{ text: "❓ Help", callback_data: "help" }]
          ]
        }
      });
    } catch (error: any) {
      if (error.message.includes("message is not modified")) {
        return bot.answerCallbackQuery(query.id, {
          text: "No changes to display",
        });
      }
      throw error;
    }
  }

  if (!user || !user.token || user.token_balance <= 0) {
    return bot.answerCallbackQuery(query.id, {
      text: "❌ No tokens available to sell",
    });
  }

  let percentageToSell = 0;

  switch (callbackData) {
    case "sell_20":
      percentageToSell = 20;
      break;
    case "sell_50":
      percentageToSell = 50;
      break;
    case "sell_70":
      percentageToSell = 70;
      break;
    case "sell_100":
      percentageToSell = 100;
      break;
    case "sell":
      return bot.editMessageText(`Current token balance: ${user.token_balance}\nChoose the percentage to sell:`, {
        chat_id: query.message!.chat.id,
        message_id: query.message!.message_id,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "20%", callback_data: "sell_20" },
              { text: "50%", callback_data: "sell_50" },
            ],
            [
              { text: "70%", callback_data: "sell_70" },
              { text: "100%", callback_data: "sell_100" },
            ],
            [{ text: "❌ Cancel", callback_data: "cancel" }]
          ],
        },
      });
    default:
      return bot.answerCallbackQuery(query.id, { text: "❌ Invalid option" });
  }

  const amountToSell = Math.floor((Number(user.token_balance) * Number(percentageToSell)) / Number(100));

  try {
    await sellCrypto(user.token, amountToSell);
    user.token_balance = await getTokenBalance(wallet.publicKey, new PublicKey(user.token));
    user.sol_balance = await connection.getBalance(wallet.publicKey);
    bot.answerCallbackQuery(query.id, {
      text: `✅ Sold ${percentageToSell}% (${amountToSell} tokens)`,
    });
    return bot.editMessageText(`✅ Successfully sold ${percentageToSell}% of your tokens!\nNew balance: ${user.token_balance}`, {
      chat_id: query.message!.chat.id,
      message_id: query.message!.message_id,
      reply_markup: {
        inline_keyboard: [
          [{ text: "💸 Sell More", callback_data: "sell" }],
          [{ text: "📊 Check Balance", callback_data: "check_balance" }],
          [
            { text: "➕ Change Token", callback_data: "add_token" },
            { text: "💰 Buy", callback_data: "buy" },
          ],
        ],
      },
    });
  } catch (error: unknown) {
    return bot.answerCallbackQuery(query.id, {
      text: `❌ Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
    });
  }
}); 

async function buyCrypto(token: string, amount: number) {
  //Please contact to @cryptokingmax   cryptokingmax.com for buy crypto functionality
}

async function sellCrypto(token: string, amount: number) {
  //Please contact to @cryptokingmax   cryptokingmax.com for buy crypto functionality
}

async function getTokenBalance(wallet: PublicKey, mint: PublicKey) {
  const ata = await getAssociatedTokenAddress(mint, wallet);
  try {
    const account = await getAccount(connection, ata);
    return Number(account.amount); // Token balance
  } catch (e) {
    return 0; // If the account doesn't exist, balance is 0
  }
}
