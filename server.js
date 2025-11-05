const express = require("express");
const app = express();
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();
const axios = require("axios");
const dayjs = require("dayjs");


// Middleware
app.use(cors());
app.use(express.json());


const BASE_URL = "https://api.coingecko.com/api/v3";
const API_KEY = process.env.API_KEY;

// 1. Fetch token metadata & market data from CoinGecko (/coins/{id} + optional
// /market_chart).
//1. Fetch token metadata (/coins/{id})
// http://localhost:5000/api/coin/bitcoin/
// app.get("/api/coin/:id/", async (req, res) => {
//   const { id } = req.params; // from req

//   try {
//     const response = await axios.get(`${BASE_URL}/coins/${id}?x_cg_demo_api_key=${API_KEY}`);
//     res.json(response.data);
//   } catch (error) {
//     console.error("Error fetching coin metadata:", error.message);
//     res.status(500).json({ error: "Failed to fetch coin metadata" });
//   }
// });



// 2. 
// retrun prices,market cap,total volumes 
// http://localhost:5000/api/coin/bitcoin/market?currency=inr&days=1
// fethcing coin market data 
// app.get("/api/coin/:id/market", async (req, res) => {
//   const { id } = req.params;
// //   const { currency , days} = req.query;
// const currency=req.query.currency   || "inr"; //incoming from req
// const days=req.query.days || "7" ;

//   try {
//     const response = await axios.get(`${BASE_URL}/coins/${id}/market_chart?vs_currency=${currency}&days=${days}&x_cg_demo_api_key=${API_KEY}`);
//     res.json(response.data);
//   } catch (error) {
//     console.error("Error fetching market data:", error.message);
//     res.status(500).json({ error: "Failed to fetch market data" });
//   }
// });



// 3 token insgights
// combine fetching,prompt,interation 
app.post("/api/token/:id/insight", async (req, res) => {

    const { id } = req.params;
    const currency = req.query.currency || "inr"; //incoming from req//keeping it dynamix
    const days = req.query.days || "7";

    try {

        console.log("Fetching coin metadata and market data...");
        // sttep 1
        const metadataResponse = await axios.get(`${BASE_URL}/coins/${id}?x_cg_demo_api_key=${API_KEY}`);
        const marketDataResponse = await axios.get(`${BASE_URL}/coins/${id}/market_chart?vs_currency=${currency}&days=${days}&x_cg_demo_api_key=${API_KEY}`);

        const coinData = metadataResponse.data;
        const marketData = marketDataResponse.data;
        console.log("metadataResponse:", metadataResponse.data);
        console.log("marketDataResponse:", marketDataResponse.data);

        console.log("Coin data and market data fetched.");

        // step 2
        // prompt string for Gemini
        const prompt = `
        You are a crypto market analyst.
        Analyze this token based on the data below and return only JSON output.

        Example output format:
        
        {
        "reasoning": "short explanation of market conditions",
        "sentiment": "Positive/Neutral/Negative",
        "trend": "upward/downward/neutral",
        "risk_level": "low/medium/high",
        "recommendation": "buy/sell/hold"
        }

        Token: ${coinData.name} (${coinData.symbol})
        Current Price: ${coinData.market_data.current_price?.[currency]}
        Market Cap: ${coinData.market_data.market_cap?.[currency]}
        24h Change: ${coinData.market_data.price_change_percentage_24h}%
        `;
        console.log("Sending prompt to Gemini...");


        // step3
        // Call Gemini API with passing prompt
        const aiResponse = await axios.post(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + process.env.GEMINI_API_KEY,
            {
                contents: [
                    {
                        parts: [
                            {
                                text: prompt
                            }
                        ]
                    }
                ],
            }
        );

        console.log("Gemini responded.");

        // 4 Parse Gemini output safely exluding text, allowing only json
        let responseText = aiResponse.data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        responseText = responseText.trim();

        //5 Extract JSON portion between { ... }
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            responseText = jsonMatch[0];
        }

        let aiInsight = {};
        try {
            aiInsight = JSON.parse(responseText);
        } catch (err) {
            console.error("Gemini JSON parse error:", err.message);
            aiInsight = { error: "Invalid JSON format from Gemini", raw: responseText };
        }


        const timestamp = new Date().toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });

        // Return combined data
        res.json({
            source: "coingecko",
            token: {
                id: coinData.id,
                symbol: coinData.symbol,
                name: coinData.name,
                market_data: {
                    current_price: coinData.market_data?.current_price?.[currency] || null,
                    market_cap: coinData.market_data?.market_cap?.[currency] || null,
                    total_volume: coinData.market_data?.total_volume?.[currency] || null,
                    price_change_percentage_24h:
                        coinData.market_data?.price_change_percentage_24h || null,
                },
            },
            insight: aiInsight,
            timestamp,
            model: { provider: "google", model: "gemini-2.5-flash" },
        });

    } catch (error) {
        console.error("Error fetching token insights:", error.message);
        res.status(500).json({ error: "Failed to fetch token insights" });
    }

})




// 4 
// Routes
// app.use("/api/hyperliquid", pnlRoutes);



app.listen(process.env.PORT, () => {
    console.log("Server is running on port " + process.env.PORT);
})