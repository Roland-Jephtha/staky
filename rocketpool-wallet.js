/**
 * rocketpool-wallet.js
 * Wallet connection logic for Rocket Pool staking page.
 * MetaMask: uses injected provider if available, falls back to QR code.
 * Other wallets: as per the pattern from your Aave dashboard script.
 */

(function() {
  "use strict";

  /* ---------------------------------------------------------------
     Helpers to show/hide QR vs spinner inside the wallet modal
  --------------------------------------------------------------- */
  function getEl(id) { return document.getElementById(id); }

  function showQrPanel(walletName) {
    var panel = getEl("rp-qr-panel");
    var spinner = getEl("rp-spinner-panel");
    if (spinner) spinner.style.display = "none";
    if (panel)   panel.style.display   = "flex";

    // Generate QR for MetaMask deeplink or WalletConnect
    var qrImg   = getEl("rp-qr-img");
    var qrTitle = getEl("rp-qr-title");
    var qrSub   = getEl("rp-qr-sub");
    var copyBtn = getEl("rp-copy-btn");

    var url = window.location.href;
    var deeplink;

    if (walletName === "MetaMask") {
      deeplink = "https://metamask.app.link/dapp/" + url.replace(/^https?:\/\//, "");
      if (qrTitle) qrTitle.textContent = "Scan with MetaMask";
      if (qrSub)   qrSub.textContent   = "Open MetaMask on your phone and scan this code";
      if (copyBtn) copyBtn.dataset.uri  = deeplink;
    } else {
      deeplink = "wc:rocketpool-placeholder-string@2?relay-protocol=irn";
      if (qrTitle) qrTitle.textContent = "Scan with your wallet";
      if (qrSub)   qrSub.textContent   = "Use any WalletConnect-compatible wallet";
      if (copyBtn) copyBtn.dataset.uri  = deeplink;
    }

    if (qrImg) {
      qrImg.src = "https://api.qrserver.com/v1/create-qr-code/?size=220x220&bgcolor=ffffff&color=000000&data="
                  + encodeURIComponent(deeplink);
    }
  }

  function showSpinnerPanel(message) {
    var panel   = getEl("rp-spinner-panel");
    var qr      = getEl("rp-qr-panel");
    var msg     = getEl("rp-spinner-msg");
    if (qr)    qr.style.display      = "none";
    if (panel) panel.style.display   = "flex";
    if (msg)   msg.textContent       = message || "Requesting connection...";
  }

  function hideSubPanels() {
    var qr = getEl("rp-qr-panel");
    var sp = getEl("rp-spinner-panel");
    if (qr) qr.style.display = "none";
    if (sp) sp.style.display = "none";
  }

  /* ---------------------------------------------------------------
     Mark wallet button as connected in the UI
  --------------------------------------------------------------- */
  function onConnected(address) {
    var short = address.slice(0, 6) + "..." + address.slice(-4);

    var connectBtn = getEl("mainConnectBtn");
    if (connectBtn) {
      connectBtn.textContent = short;
      connectBtn.style.background = "rgba(232,119,60,0.15)";
      connectBtn.style.border     = "1px solid rgba(232,119,60,0.5)";
      connectBtn.onclick = null;  // disable re-open
    }

    closeWalletModal();
    console.log("Connected:", address);
  }

  /* ---------------------------------------------------------------
     Close helpers (these mirror the inline functions in rocketpool.html)
  --------------------------------------------------------------- */
  function closeWalletModal() {
    var overlay = getEl("modalOverlay");
    if (overlay) overlay.classList.remove("open");
    document.body.style.overflow = "";
    hideSubPanels();
  }

  /* ---------------------------------------------------------------
     MetaMask connection
     - If window.ethereum is available and is MetaMask → connect directly
     - Otherwise → show QR deeplink
  --------------------------------------------------------------- */
  async function connectMetaMask() {
    var provider = null;

    // Prefer MetaMask over other injected providers
    if (window.ethereum) {
      if (window.ethereum.isMetaMask) {
        provider = window.ethereum;
      } else if (window.ethereum.providers) {
        // EIP-6963 / multiple providers
        provider = window.ethereum.providers.find(function(p) { return p.isMetaMask; });
      }
    }

    if (provider) {
      // MetaMask is installed – request accounts directly
      showSpinnerPanel("Opening MetaMask...");
      try {
        var accounts = await provider.request({ method: "eth_requestAccounts" });
        if (accounts && accounts.length > 0) {
          onConnected(accounts[0]);
        } else {
          throw new Error("No accounts returned");
        }
      } catch (err) {
        hideSubPanels();
        if (err.code !== 4001) {  // 4001 = user rejected
          alert("MetaMask connection failed: " + (err.message || "Unknown error"));
        }
      }
    } else {
      // MetaMask not installed → show QR / deeplink to install/open on mobile
      showQrPanel("MetaMask");
    }
  }

  /* ---------------------------------------------------------------
     Phantom (Solana) connection
  --------------------------------------------------------------- */
  async function connectPhantom() {
    showSpinnerPanel("Opening Phantom...");
    var provider = window.phantom && window.phantom.solana;
    if (!provider || !provider.isPhantom) {
      hideSubPanels();
      var go = confirm("Phantom wallet not detected. Open phantom.app to install?");
      if (go) window.open("https://phantom.app/", "_blank");
      return;
    }
    try {
      var resp = await provider.connect();
      onConnected(resp.publicKey.toString());
    } catch (err) {
      hideSubPanels();
      if (err.code !== 4001) alert("Phantom connection failed: " + (err.message || "Unknown error"));
    }
  }

  /* ---------------------------------------------------------------
     Coinbase Wallet connection
  --------------------------------------------------------------- */
  async function connectCoinbase() {
    showSpinnerPanel("Opening Coinbase Wallet...");
    var provider = (window.ethereum && window.ethereum.isCoinbaseWallet)
                    ? window.ethereum
                    : window.coinbaseWalletExtension || null;
    if (!provider) {
      hideSubPanels();
      alert("Coinbase Wallet not detected.");
      return;
    }
    try {
      var accounts = await provider.request({ method: "eth_requestAccounts" });
      onConnected(accounts[0]);
    } catch (err) {
      hideSubPanels();
      if (err.code !== 4001) alert("Coinbase Wallet error: " + (err.message || "Unknown error"));
    }
  }

  /* ---------------------------------------------------------------
     Generic browser wallet (window.ethereum, any injected)
  --------------------------------------------------------------- */
  async function connectBrowserWallet() {
    if (!window.ethereum) {
      alert("No browser wallet detected. Please install MetaMask or another wallet.");
      return;
    }
    showSpinnerPanel("Connecting...");
    try {
      var accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      onConnected(accounts[0]);
    } catch (err) {
      hideSubPanels();
      if (err.code !== 4001) alert("Wallet error: " + (err.message || "Unknown error"));
    }
  }

  /* ---------------------------------------------------------------
     WalletConnect / Other Wallets → show QR
  --------------------------------------------------------------- */
  function connectWalletConnect() {
    showQrPanel("WalletConnect");
  }

  /* ---------------------------------------------------------------
     SafePal
  --------------------------------------------------------------- */
  async function connectSafePal() {
    showSpinnerPanel("Opening SafePal...");
    var provider = window.safepal || (window.ethereum && window.ethereum.isSafePal ? window.ethereum : null);
    if (!provider) {
      hideSubPanels();
      var go = confirm("SafePal not detected. Open safepal.com to install?");
      if (go) window.open("https://www.safepal.com/download", "_blank");
      return;
    }
    try {
      var accounts = await provider.request({ method: "eth_requestAccounts" });
      onConnected(accounts[0]);
    } catch (err) {
      hideSubPanels();
      if (err.code !== 4001) alert("SafePal error: " + (err.message || "Unknown error"));
    }
  }

  /* ---------------------------------------------------------------
     Copy URI button (inside QR panel)
  --------------------------------------------------------------- */
  function initCopyBtn() {
    var btn = getEl("rp-copy-btn");
    if (!btn) return;
    btn.addEventListener("click", function() {
      var uri = btn.dataset.uri || "wc:rocketpool";
      if (navigator.clipboard) {
        navigator.clipboard.writeText(uri).then(function() {
          var orig = btn.innerHTML;
          btn.innerHTML = "Copied!";
          setTimeout(function() { btn.innerHTML = orig; }, 2000);
        });
      }
    });
  }

  /* ---------------------------------------------------------------
     Wire up wallet list items
     We expect each wallet row to have data-rp-wallet="MetaMask" etc.
  --------------------------------------------------------------- */
  function initWalletListeners() {
    var items = document.querySelectorAll("[data-rp-wallet]");
    items.forEach(function(el) {
      el.addEventListener("click", function() {
        var name = el.getAttribute("data-rp-wallet");
        hideSubPanels();
        switch (name) {
          case "MetaMask":        connectMetaMask();        break;
          case "Phantom":         connectPhantom();         break;
          case "CoinbaseWallet":  connectCoinbase();        break;
          case "BrowserWallet":   connectBrowserWallet();   break;
          case "WalletConnect":   connectWalletConnect();   break;
          case "SafePal":         connectSafePal();         break;
          case "Binance":
            showSpinnerPanel("Opening Binance Wallet...");
            setTimeout(function() {
              hideSubPanels();
              window.open("https://www.bnbchain.org/en/binance-wallet", "_blank");
            }, 800);
            break;
          default:
            showQrPanel(name);
        }
      });
    });
    initCopyBtn();
  }

  /* ---------------------------------------------------------------
     Init on DOM ready
  --------------------------------------------------------------- */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWalletListeners);
  } else {
    initWalletListeners();
  }

})();
