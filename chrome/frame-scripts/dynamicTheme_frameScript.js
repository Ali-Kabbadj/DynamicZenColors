(function () {
  const DEBUG = false;

  function log(message, data) {
    if (DEBUG) {
      if (data) {
        console.log(`[DynamicTheme][FrameScript] ${message}:`, data);
      } else {
        console.log(`[DynamicTheme][FrameScript] ${message}`);
      }
    }
  }

  // send HTML of the content document to the main process
  function sendHTML() {
    try {
      if (content && content.document) {
        let html = content.document.documentElement.outerHTML;
        dump(
          `[DynamicTheme][FrameScript] Sending HTML of length: ${html.length}\n`,
        );
        sendAsyncMessage("DynamicTheme:ContentHTML", { html: html });
      } else {
        dump("[DynamicTheme][FrameScript] No content document available\n");
      }
    } catch (e) {
      dump(`[DynamicTheme][FrameScript] Error in sendHTML: ${e.message}\n`);
    }
  }

  function init() {
    log("Frame script initialized");

    try {
      // Check if the content document is already loaded
      if (
        content &&
        content.document &&
        content.document.readyState === "complete"
      ) {
        log("Document is already loaded, sending HTML");
        sendHTML();
      } else {
        log("Document is not loaded yet, adding load event listener");
        // Add event listener to the content window
        addEventListener(
          "DOMContentLoaded",
          function onLoad() {
            removeEventListener("DOMContentLoaded", onLoad);
            sendHTML();
          },
          true,
        );
      }
    } catch (e) {
      dump(`[DynamicTheme][FrameScript] Error in init: ${e.message}\n`);
    }
  }

  // Initialize the frame script
  init();
})();
