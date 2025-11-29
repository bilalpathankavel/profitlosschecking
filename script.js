const TAX_GST = 0.18;
// Combined SEBI Turnover (0.0001%) + Exchange Charges (0.00307%)
const RATE_SEBI_EXCH = (0.0001 + 0.00307) / 100; 
const RATE_BROKERAGE_DELIVERY = 0.000704847026178763; // 0.0704847026178763%
const MIN_BROKERAGE = 20;

// --- CORE CALCULATION LOGIC ---
/**
 * Calculates all charges for a single trade (Buy or Sell).
 * @param {number} qty - Trade quantity.
 * @param {number} price - Trade price.
 * @param {string} action - 'BUY' or 'SELL'.
 * @param {string} segment - 'ROLLING T1' (Delivery) or 'INTRADAY' or 'F&O'.
 * @returns {object} - Calculated charge details.
 */
function calculateTradeCharges(qty, price, action, segment) {
    const tradeValue = qty * price;
    const isDelivery = segment.toUpperCase() === 'ROLLING T1';
    const actionUpper = action.toUpperCase();
    const segmentUpper = segment.toUpperCase();

    // 1. Brokerage (Base)
    const brokerageBase = 
        isDelivery 
        ? tradeValue * RATE_BROKERAGE_DELIVERY
        : // For non-delivery (INTRADAY & F&O) use 0.007% (0.00007)
          tradeValue * 0.00007;
    
    // 2. GST on Brokerage
    const brokerageGST = brokerageBase * TAX_GST;

    // 3. Total Brokerage
    const totalBrokerage = brokerageBase + brokerageGST;

    // 4. STT 
    let stt = 0;
    if (segmentUpper === "F&O" && actionUpper === "SELL") {
        // F&O sell STT = 0.02% -> 0.0002
        stt = tradeValue * 0.0002;
    } else if (isDelivery) {
        stt = tradeValue * 0.001; 
    } else if (actionUpper === 'SELL') {
        stt = tradeValue * 0.00025;
    }

    // 5. SEBI/Exchange Charges
    // SEBI Turnover = tradeValue * 0.0001%
    const sebiTurnover = tradeValue * 0.000001;
    // Exchange Transaction Charges: F&O -> 0.00183%, else 0.00307%
    const exchangeCharges = (segmentUpper === "F&O") ? tradeValue * 0.0000183 : tradeValue * 0.0000307;
    const sebiExchangeCharges = sebiTurnover + exchangeCharges;

    // 6. Stamp Duty
    let stampDuty = 0;
    if (segmentUpper === "F&O" && actionUpper === "BUY") {
        // F&O Buy stamp 0.002% -> 0.00002
        stampDuty = tradeValue * 0.00002;
    } else if (isDelivery) {
        if (actionUpper === "BUY") stampDuty = tradeValue * 0.00015; // 0.015%
    } else {
        if (actionUpper === "BUY") stampDuty = tradeValue * 0.00003; // 0.003%
    }

    // 7. Total Charges
    const totalCharges = stt + sebiExchangeCharges + stampDuty + totalBrokerage;

    return {
        // Display rounded integers but keep original numbers for accuracy
        tradeValue: Math.round(tradeValue),
        stt: Math.round(stt),
        sebiExchangeCharges: Math.round(sebiExchangeCharges),
        stampDuty: Math.round(stampDuty),
        totalBrokerage: Math.round(totalBrokerage),
        totalCharges: Math.round(totalCharges),
        qty: qty,
        
        // Original precise values
        _originalTradeValue: tradeValue,
        _originalTotalCharges: totalCharges
    };
}


// --- MAIN P&L HANDLER ---

function formatNumber(num, decimals = 2) {
    if (isNaN(num) || !isFinite(num)) {
        return 'N/A';
    }
    // Only format decimals for price/rate fields
    return num.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatInteger(num) {
    if (isNaN(num) || !isFinite(num)) {
        return 'N/A';
    }
    // Format as a rounded integer
    return Math.round(num).toLocaleString('en-IN');
}

function updateResultRow(elementId, side, results) {
    const row = document.getElementById(elementId);
    row.innerHTML = ''; 
    
    row.insertCell().textContent = side;
    row.insertCell().textContent = formatInteger(results.tradeValue);
    row.insertCell().textContent = formatInteger(results.stt);
    row.insertCell().textContent = formatInteger(results.sebiExchangeCharges);
    row.insertCell().textContent = formatInteger(results.stampDuty);
    row.insertCell().textContent = formatInteger(results.totalBrokerage);
    row.insertCell().textContent = formatInteger(results.totalCharges);
}

function calculateProfitLoss() {
    const errorMsg = document.getElementById('errorMsg');
    errorMsg.classList.add('hidden');
    
    // Ensure sell qty & segment mirror buy side (logic only; HTML kept same)
    document.getElementById('sellQty').value = document.getElementById('buyQty').value;
    document.getElementById('sellSegment').value = document.getElementById('buySegment').value;

    // --- 1. Get and Validate Inputs ---
    const buyQty = Number(document.getElementById('buyQty').value);
    const buyPrice = Number(document.getElementById('buyPrice').value);
    const buySegment = document.getElementById('buySegment').value;
    
    const sellQty = Number(document.getElementById('sellQty').value);
    const sellPrice = Number(document.getElementById('sellPrice').value);
    const sellSegment = document.getElementById('sellSegment').value;

    if (buyQty <= 0 || buyPrice <= 0 || sellQty <= 0 || sellPrice <= 0 || isNaN(buyQty) || isNaN(buyPrice)) {
        errorMsg.textContent = 'Please enter valid quantities and prices (> 0).';
        errorMsg.classList.remove('hidden');
        document.getElementById('resultsHeader').classList.add('hidden');
        document.getElementById('finalPL').classList.add('hidden');
        document.getElementById('loadedRateSection').classList.add('hidden');
        return;
    }
    if (buyQty !== sellQty) {
        errorMsg.textContent = 'The Buy Quantity and Sell Quantity must match for a single P&L calculation.';
        errorMsg.classList.remove('hidden');
        document.getElementById('finalPL').classList.add('hidden');
        document.getElementById('loadedRateSection').classList.add('hidden');
        return;
    }

    // --- 2. Calculate Charges for each side ---
    const buyCharges = calculateTradeCharges(buyQty, buyPrice, 'BUY', buySegment);
    const sellChargesActual = calculateTradeCharges(sellQty, sellPrice, 'SELL', sellSegment);
    
    // Use the accurate original values for P&L calculation
    const grossProfit = (sellQty * sellPrice) - (buyQty * buyPrice);
    const totalCharges = buyCharges._originalTotalCharges + sellChargesActual._originalTotalCharges;
    const netProfitLoss = grossProfit - totalCharges;

    // --- 3. Update Table (using rounded display values) ---
    updateResultRow('buy-row', 'Buy', buyCharges);
    updateResultRow('sell-row', 'Sell', sellChargesActual);
    
    // --- 4. Calculate Loaded Rate (Break-Even Price) ---
    // Correct formula per request:
    // (Total Buy Trade Value + Total Charges) / Buy Qty
    const totalBuyTradeValue = buyCharges._originalTradeValue;
    const sellPriceRequiredToBreakEven = (totalBuyTradeValue + totalCharges) / (buyQty > 0 ? buyQty : 1);

    // --- 5. Update P&L Summary (using rounded integer display for P&L, but based on accurate calculation) ---
    document.getElementById('gross-pl').textContent = formatInteger(grossProfit);
    document.getElementById('total-charges-pl').textContent = formatInteger(totalCharges);
    
    const netPLSpan = document.getElementById('net-pl');
    netPLSpan.textContent = formatInteger(netProfitLoss);
    
    // Apply colors
    netPLSpan.classList.remove('profit', 'loss', 'zero');
    if (netProfitLoss > 0) {
        netPLSpan.classList.add('profit');
        netPLSpan.textContent = "+" + netPLSpan.textContent;
    } else if (netProfitLoss < 0) {
        netPLSpan.classList.add('loss');
    } else {
        netPLSpan.classList.add('zero');
    }

    // Update Loaded Rate / Break-Even Price (Keep 4 decimals, no thousands grouping)
    const loadedRateSpan = document.getElementById('loaded-rate');
    if (!isFinite(sellPriceRequiredToBreakEven) || buyQty <= 0) {
        loadedRateSpan.textContent = 'N/A';
    } else {
        loadedRateSpan.textContent = sellPriceRequiredToBreakEven.toFixed(4);
    }
    
    // Show Results
    document.getElementById('resultsHeader').classList.remove('hidden');
    document.getElementById('resultsTableContainer').classList.remove('hidden');
    document.getElementById('finalPL').classList.remove('hidden');
    document.getElementById('loadedRateSection').classList.remove('hidden');
}

// Ensure the calculateProfitLoss function runs on load
document.addEventListener('DOMContentLoaded', () => {
    // Run initial calculation with default values
    calculateProfitLoss(); 
});
