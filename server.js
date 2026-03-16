const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const url = "mongodb://localhost:27017";
const client = new MongoClient(url);

let db;

// ─────────────────────────────────────────────────────────────────────────────
// CORE REBALANCE LOGIC
// Separated into its own function so it can be called by both GET and POST.
// ─────────────────────────────────────────────────────────────────────────────
async function computeRebalance(clientId) {
    const holdings = await db
        .collection("client_holdings")
        .find({ client_id: clientId })
        .toArray();

    const modelFunds = await db
        .collection("model_funds")
        .find({})
        .toArray();

    // Build lookup maps
    const modelMap = {};
    for (const mf of modelFunds) modelMap[mf.fund_id] = mf;

    const holdingMap = {};
    for (const h of holdings) holdingMap[h.fund_id] = h;

    // Total portfolio value = sum of ALL holdings (including out-of-plan funds)
    const totalValue = holdings.reduce((sum, h) => sum + h.current_value, 0);

    const items = [];

    // ── Step 1: Process every fund that IS in the plan ──────────────────────
    for (const [fid, mf] of Object.entries(modelMap)) {
        const currentVal = holdingMap[fid]?.current_value ?? 0;
        const currentPct = totalValue > 0 ? (currentVal / totalValue) * 100 : 0;
        const targetPct = mf.allocation_pct;
        const drift = targetPct - currentPct;                // + means under-weight → BUY
        const amount = (drift / 100) * totalValue;           // rupee amount to move

        let action, absAmount;
        if (amount > 0.5) {
            action = "BUY";
            absAmount = Math.round(amount);
        } else if (amount < -0.5) {
            action = "SELL";
            absAmount = Math.round(Math.abs(amount));
        } else {
            action = "HOLD";
            absAmount = 0;
        }

        items.push({
            fund_id: fid,
            fund_name: mf.fund_name,
            asset_class: mf.asset_class,
            action,
            amount: absAmount,
            current_val: Math.round(currentVal),
            current_pct: Math.round(currentPct * 10) / 10,
            target_pct: targetPct,
            drift: Math.round(drift * 10) / 10,
            post_rebalance_pct: targetPct,
            is_model_fund: true,
        });
    }

    // ── Step 2: Flag any holdings that are NOT in the plan ──────────────────
    for (const [fid, h] of Object.entries(holdingMap)) {
        if (!modelMap[fid]) {
            const currentPct = totalValue > 0 ? (h.current_value / totalValue) * 100 : 0;
            items.push({
                fund_id: fid,
                fund_name: h.fund_name,
                asset_class: "—",
                action: "REVIEW",
                amount: Math.round(h.current_value),
                current_val: Math.round(h.current_value),
                current_pct: Math.round(currentPct * 10) / 10,
                target_pct: null,
                drift: null,
                post_rebalance_pct: null,
                is_model_fund: false,
            });
        }
    }

    const totalToBuy = items.filter(i => i.action === "BUY").reduce((s, i) => s + i.amount, 0);
    const totalToSell = items.filter(i => i.action === "SELL").reduce((s, i) => s + i.amount, 0);
    const netCashNeeded = totalToBuy - totalToSell;

    return {
        client_id: clientId,
        total_value: Math.round(totalValue),
        total_to_buy: Math.round(totalToBuy),
        total_to_sell: Math.round(totalToSell),
        net_cash_needed: Math.round(netCashNeeded),
        items,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// GET all clients (for the client switcher dropdown)
app.get("/api/clients", async (req, res) => {
    try {
        const clients = await db.collection("clients").find({}).toArray();
        res.json(clients);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET holdings for a client (Screen 2)
app.get("/api/clients/:clientId/holdings", async (req, res) => {
    try {
        const holdings = await db
            .collection("client_holdings")
            .find({ client_id: req.params.clientId })
            .toArray();

        const totalValue = holdings.reduce((s, h) => s + h.current_value, 0);
        const enriched = holdings.map(h => ({
            ...h,
            pct: totalValue > 0 ? Math.round((h.current_value / totalValue) * 1000) / 10 : 0,
        }));

        res.json({ holdings: enriched, total_value: Math.round(totalValue) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET rebalance recommendation (Screen 1 — live calc, nothing saved yet)
app.get("/api/clients/:clientId/rebalance", async (req, res) => {
    try {
        res.json(await computeRebalance(req.params.clientId));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST save recommendation (the Save button on Screen 1)
app.post("/api/clients/:clientId/rebalance/save", async (req, res) => {
    try {
        const data = await computeRebalance(req.params.clientId);

        const session = {
            client_id: req.params.clientId,
            created_at: new Date(),
            portfolio_value: data.total_value,
            total_to_buy: data.total_to_buy,
            total_to_sell: data.total_to_sell,
            net_cash_needed: data.net_cash_needed,
            status: "PENDING",
        };

        const sessionResult = await db.collection("rebalance_sessions").insertOne(session);
        const sessionId = sessionResult.insertedId;

        const itemDocs = data.items.map(item => ({
            session_id: sessionId,
            fund_id: item.fund_id,
            fund_name: item.fund_name,
            action: item.action,
            amount: item.amount,
            current_pct: item.current_pct,
            target_pct: item.target_pct,
            post_rebalance_pct: item.post_rebalance_pct,
            is_model_fund: item.is_model_fund,
        }));

        await db.collection("rebalance_items").insertMany(itemDocs);

        res.json({ success: true, session_id: sessionId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET history (Screen 3)
app.get("/api/clients/:clientId/history", async (req, res) => {
    try {
        const sessions = await db
            .collection("rebalance_sessions")
            .find({ client_id: req.params.clientId })
            .sort({ created_at: -1 })
            .toArray();

        const result = await Promise.all(
            sessions.map(async session => {
                const items = await db
                    .collection("rebalance_items")
                    .find({ session_id: session._id })
                    .toArray();
                return { ...session, items };
            })
        );

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH update session status (APPLIED or DISMISSED)
app.patch("/api/sessions/:sessionId/status", async (req, res) => {
    try {
        const { status } = req.body;
        if (!["APPLIED", "DISMISSED", "PENDING"].includes(status)) {
            return res.status(400).json({ error: "Invalid status" });
        }
        await db.collection("rebalance_sessions").updateOne(
            { _id: new ObjectId(req.params.sessionId) },
            { $set: { status } }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET model funds (Screen 4)
app.get("/api/model-funds", async (req, res) => {
    try {
        const funds = await db.collection("model_funds").find({}).toArray();
        res.json(funds);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT update model fund allocations (Screen 4 — Save Plan)
app.put("/api/model-funds", async (req, res) => {
    try {
        const funds = req.body.funds; // [{ fund_id, allocation_pct }, ...]
        const total = funds.reduce((s, f) => s + Number(f.allocation_pct), 0);

        if (Math.abs(total - 100) > 0.01) {
            return res.status(400).json({ error: `Allocations must sum to 100%. Currently: ${total.toFixed(1)}%` });
        }

        for (const f of funds) {
            await db.collection("model_funds").updateOne(
                { fund_id: f.fund_id },
                { $set: { allocation_pct: Number(f.allocation_pct) } }
            );
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────────────────────────────────────
async function start() {
    console.log("Connecting to MongoDB...");
    await client.connect();
    console.log("Connected to MongoDB");
    db = client.db("portfolioDB");

    app.listen(3000, () => {
        console.log("Server running at http://localhost:3000");
    });
}

start().catch(err => {
    console.error("Failed to start:", err);
    process.exit(1);
});
