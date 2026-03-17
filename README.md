💼 Portfolio Rebalancer
A web app for financial advisors and clients to compare current mutual fund holdings against a recommended model portfolio — and get exact BUY / SELL recommendations to rebalance.


📸 Screenshots


<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/17a69017-e666-4966-8baa-1d7202a31888" />


🧠 Problem Statement
In mutual fund investing, a financial advisor creates a Model Portfolio — a recommended allocation across funds (e.g. 30% in large cap, 25% in flexi cap). Over time, market movements cause the actual portfolio to drift away from this target.
This app:

Shows the drift between current holdings and the recommended plan
Calculates the exact rupee amount to buy or sell per fund to rebalance
Flags funds that are outside the plan and need review
Saves a history of past recommendations
Allows the advisor to edit the plan and instantly recalculate


⚙️ Tech Stack
| Layer     | Technology               |
|----------|---------------------------|
| Backend  | Node.js + Express.js      |
| Database | MongoDB                   |
| Frontend | HTML, CSS, JavaScript     |
No React, no TypeScript, no ORM — intentionally simple and fast to run.

📁 Project Structure
project/
├── server.js          # Express backend — all API routes + rebalance logic
├── package.json
└── public/
    └── index.html     # Frontend SPA — all 4 screens in one file

🧠 Key Design Decisions

- Used MongoDB for flexible schema and fast iteration during prototyping
- Stored rebalance results in separate collections to maintain audit history
- Chose vanilla JS to keep the app lightweight and dependency-free
- Calculations performed server-side to ensure consistency and accuracy

🚀 Getting Started
Prerequisites

Node.js installed
MongoDB running locally on port 27017
Your MongoDB portfolioDB database populated with:

clients
model_funds
client_holdings
rebalance_sessions (empty — app writes to this)
rebalance_items (empty — app writes to this)



Install & Run
bash# 1. Install dependencies
npm install

# 2. Start the server
node server.js

# 3. Open in browser
http://localhost:3000

🗄️ Database Schema
### clients
| Field           | Description                    |
|----------------|---------------------------------|
| client_id      | Unique ID (e.g. C001)           |
| client_name    | Full name                       |
| total_invested | Original invested amount        |

### model_funds
| Field          | Description                  |
| -------------- | ---------------------------- |
| fund_id        | Unique ID (e.g., F001)       |
| fund_name      | Full fund name               |
| asset_class    | EQUITY / DEBT / GOLD         |
| allocation_pct | Target allocation percentage |

### client_holdings| Field         | Description |
| ------------- | ------------------------------ |
| client_id     | References client              |
| fund_id       | Fund ID (can be outside model) |
| fund_name     | Fund name                      |
| current_value | Current value (₹)              |

rebalance_sessions

  One record per saved recommendation

rebalance_items

  One record per fund per recommendation

📊 How the Rebalance Calculation Works
Step 1 — Calculate current % for each fund
current % = (current_value / total_portfolio_value) × 100
Step 2 — Calculate drift
drift = target % - current %

Positive drift → fund is underweight → BUY
Negative drift → fund is overweight → SELL

Step 3 — Calculate rupee amount
amount = (drift / 100) × total_portfolio_value
Example for Amit Sharma (total portfolio = ₹5,80,000):
| Fund                        | Target | Current | Drift  | Action | Amount    |
| --------------------------- | ------ | ------- | ------ | ------ | --------- |
| Mirae Asset Large Cap       | 30%    | 15.5%   | +14.5% | BUY    | ₹84,000   |
| Parag Parikh Flexi Cap      | 25%    | 26.7%   | -1.7%  | SELL   | ₹10,000   |
| HDFC Mid Cap Opportunities  | 20%    | 0.0%    | +20.0% | BUY    | ₹1,16,000 |
| ICICI Prudential Bond       | 15%    | 19.0%   | -4.0%  | SELL   | ₹23,000   |
| Nippon India Gold ETF       | 10%    | 25.0%   | -15.0% | SELL   | ₹87,000   |
| Axis Bluechip (Out of Plan) | —      | 13.8%   | —      | REVIEW | ₹80,000   |

Summary:

Total BUY: ₹2,00,000

Total SELL: ₹1,20,000

Fresh Investment Needed: ₹80,000

🖥️ App Screens
Screen 1 — Dashboard

Stat cards: portfolio value, total to buy, total to sell, fresh money needed
Table of all plan funds with current %, target %, drift, and BUY/SELL action
Separate section flagging out-of-plan funds for review
Save Recommendation button

Screen 2 — Holdings

Full list of all funds the client currently holds
Current value and % of portfolio for each

Screen 3 — History

All past saved recommendations in collapsible cards
Each card shows the date, portfolio value, and status (PENDING / APPLIED / DISMISSED)
Advisor can mark each recommendation as Applied or Dismissed

Screen 4 — Edit Plan

Editable form showing all 5 funds and their target %
Live total that turns green when allocations sum to exactly 100%
Save & Recalculate updates MongoDB and refreshes the dashboard


🔌 API Reference
| Method | Endpoint                        | Description                  |
| ------ | ------------------------------- | ---------------------------- |
| GET    | /api/clients                    | Get all clients              |
| GET    | /api/clients/:id/holdings       | Get client holdings          |
| GET    | /api/clients/:id/rebalance      | Get rebalance recommendation |
| POST   | /api/clients/:id/rebalance/save | Save recommendation          |
| GET    | /api/clients/:id/history        | Get past recommendations     |
| PATCH  | /api/sessions/:id/status        | Update recommendation status |
| GET    | /api/model-funds                | Get model portfolio          |
| PUT    | /api/model-funds                | Update model portfolio       |

🧩 Edge Cases Handled

Fund in plan but not invested (₹0) — HDFC Mid Cap has ₹0 current value. The code uses holdingMap[fid]?.current_value ?? 0 so it doesn't crash and correctly recommends a full BUY.
Fund not in plan — Axis Bluechip (F006) exists in holdings but not in model_funds. The app flags it as REVIEW instead of giving a BUY/SELL recommendation.
Portfolio value includes out-of-plan funds — Total is calculated from ALL holdings including F006, so percentages are always accurate relative to the real portfolio value.


📦 Dependencies
json
{
  "express": "^4.18.2",
  "mongodb": "^6.0.0"
}

👤 Author
Built by Pragya Bachhawat
