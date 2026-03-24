chrome.runtime.onInstalled.addListener(() => {
  console.log("Hello MV3: background installed");
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  console.log("BG got:", msg);
  if (msg === "ping") sendResponse("pong");
  return true;
});