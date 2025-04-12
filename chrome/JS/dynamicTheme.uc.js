// ==UserScript==
// @name           Dynamic Theme
// @description    Changes Firefox UI colors based on the current website
// ==/UserScript==

const DynamicTheme = {
  // Configuration
  DEBUG: true,
  COLOR_MEMORY: new Map(), // Cache colors by domain
  DEFAULT_COLOR: " #000000", // Firefox's default dark theme color
  MINIMUM_CONTRAST_RATIO: 4.5, // For text readability
  MAX_RETRIES: 5, // Maximum number of extraction attempts

  currentBrowser: null,
  html: null,

  // Initialization
  init() {
    this.log("Initializing DynamicTheme");

    // Initial run for the first tab
    this.updateThemeForCurrentTab();

    // Add tab switch listener
    gBrowser.tabContainer.addEventListener("TabSelect", () => {
      this.updateThemeForCurrentTab();
    });

    // More reliable page loading detection
    gBrowser.addTabsProgressListener({
      onStateChange: (
        browser,
        webProgress,
        request,
        stateFlags,
        statusCode,
      ) => {
        const STATE_STOP =
          Components.interfaces.nsIWebProgressListener.STATE_STOP;
        const STATE_IS_NETWORK =
          Components.interfaces.nsIWebProgressListener.STATE_IS_NETWORK;

        // Only handle completion of network activity
        if (stateFlags & STATE_STOP && stateFlags & STATE_IS_NETWORK) {
          if (browser === gBrowser.selectedBrowser) {
            // Clear any pending timer
            if (this._pendingTimer) {
              clearTimeout(this._pendingTimer);
            }

            // Set a short delay to let DOM settle
            this._pendingTimer = setTimeout(() => {
              this.updateThemeForCurrentTab();
              this._pendingTimer = null;
            }, 50);
          }
        }
      },
      QueryInterface: ChromeUtils.generateQI([
        "nsITabProgressListener",
        "nsISupportsWeakReference",
      ]),
    });

    this.log("All event listeners initialized");
  },

  // Logger
  log(message, data = "", what = "") {
    if (this.DEBUG) {
      if (data && !what) {
        console.log(`[DynamicTheme]  ${message}:`, data);
      } else if (what && data) {
        console.log(`[DynamicTheme][${what}] ${message} :`, data);
      } else if (what && !data) {
        console.log(`[DynamicTheme][${what}] ${message}`);
      } else {
        console.log(`[DynamicTheme] ${message}`);
      }
    }
  },

  retryFindHTMLRecursiveUpdateThemeForCurrentTab(retryCount) {
    if (retryCount < this.MAX_RETRIES) {
      this.log(
        "No content document yet, retrying soon retry nb",
        retryCount.toString(),
        "retryFindHTMLRecursiveUpdateThemeForCurrentTab",
      );
      setTimeout(() => this.updateThemeForCurrentTab(retryCount + 1), 200);
    }
    return;
  },

  injectFrameScript() {
    let self = this;

    // Clear any existing HTML before requesting new
    this.html = null;

    if (window.messageManager && window.messageManager.loadFrameScript) {
      let uri = "chrome://frame-scripts/content/dynamicTheme_frameScript.js";
      window.messageManager.loadFrameScript(uri, true);
      self.log("Frame script injected: dynamicTheme_frameScript.js");
    } else {
      console.error("Message manager not available; cannot load frame script.");
      return null;
    }

    // Add a one-time message listener to catch the HTML sent back by the frame script
    this.currentBrowser.messageManager.addMessageListener(
      "DynamicTheme:ContentHTML",
      function listener(msg) {
        self.html = msg.data.html;
        self.log(
          "Active tab HTML retrieved:",
          self.html ? "HTML received" : "No HTML received",
        );

        // Remove this listener so it runs only once per event
        self.currentBrowser.messageManager.removeMessageListener(
          "DynamicTheme:ContentHTML",
          listener,
        );

        // Process the HTML directly here
        if (self.html) {
          const url = self.currentBrowser.currentURI.spec;
          const hostname = new URL(url).hostname;
          const color = self.extractColorFromPage(self.html, hostname);

          if (color) {
            self.COLOR_MEMORY.set(hostname, color);
            self.applyColor(color);
          } else {
            self.log("No usable color found, using default");
            self.applyColor(self.DEFAULT_COLOR);
          }
        }
      },
    );
    return null;
  },

  // Main update function
  updateThemeForCurrentTab(retryCount = 0) {
    // Prevent multiple parallel executions
    if (this._updateInProgress) {
      this.log("Update already in progress, skipping");
      return;
    }

    this._updateInProgress = true;
    this.DEBUG = true;

    try {
      this.currentBrowser = gBrowser.selectedBrowser;

      // Check if browser is ready
      if (!this.currentBrowser || !this.currentBrowser.currentURI) {
        this.log("Browser or URI not ready");
        this._updateInProgress = false;
        return;
      }

      const url = this.currentBrowser.currentURI.spec;

      // Skips
      if (!url.startsWith("http") && !url.startsWith("https")) {
        this.log("Skipping non-supported URL:", url, "SkippingNonSupportedURL");
        this.DEBUG = false;
        this.applyColor(this.DEFAULT_COLOR);
        this._updateInProgress = false;
        return;
      }

      const hostname = new URL(url).hostname;

      // // First check if we have a cached color for this domain
      // if (this.COLOR_MEMORY.has(hostname)) {
      //   this.log(
      //     `Using cached color for ${hostname}:`,
      //     this.COLOR_MEMORY.get(hostname),
      //   );
      //   this.applyColor(this.COLOR_MEMORY.get(hostname));
      //   this._updateInProgress = false;
      //   return;
      // }

      // Try the hardcoded color
      const knownColor = this.getKnownSiteColor(hostname);
      if (knownColor) {
        this.log(`Found known site color for ${hostname}:`, knownColor);
        this.COLOR_MEMORY.set(hostname, knownColor);
        this.applyColor(knownColor);
        this._updateInProgress = false;
        return;
      }

      // Check if we already have HTML content
      if (this.html) {
        // Extract color from HTML
        const color = this.extractColorFromPage(this.html, hostname);
        if (color) {
          this.COLOR_MEMORY.set(hostname, color);
          this.applyColor(color);
          this._updateInProgress = false;
          return;
        }

        // If we have HTML but couldn't extract a color, apply default
        this.log("No usable color found for " + hostname + ", using default");
        this.applyColor(this.DEFAULT_COLOR);
        this._updateInProgress = false;
        return;
      }

      // If we don't have HTML yet, inject frame script and set up listener
      let self = this;

      // Set up one-time message listener
      const messageListener = function (msg) {
        self.html = msg.data.html;
        self.log(
          "Active tab HTML retrieved:",
          self.html ? "HTML received" : "No HTML received",
        );

        // Remove this listener to prevent duplicates
        self.currentBrowser.messageManager.removeMessageListener(
          "DynamicTheme:ContentHTML",
          messageListener,
        );

        if (self.html) {
          // Extract color from HTML
          const color = self.extractColorFromPage(self.html, hostname);
          if (color) {
            self.COLOR_MEMORY.set(hostname, color);
            self.applyColor(color);
            self._updateInProgress = false;
            return;
          }
        }

        // If we couldn't extract a color, retry or apply default
        if (retryCount < self.MAX_RETRIES - 1) {
          self.log(
            `No color found yet, retrying (${retryCount + 1}/${
              self.MAX_RETRIES
            })...`,
            retryCount,
            "retrying updateThemeForCurrentTab with timeout",
          );
          setTimeout(() => {
            self._updateInProgress = false; // Release lock before retrying
            self.updateThemeForCurrentTab(retryCount + 1);
          }, 300);
        } else {
          self.log(
            "Max retries exceeded, using default color, reason is we couldn't find a color",
            "",
            "MaxRetriesExceeded",
          );
          self.applyColor(self.DEFAULT_COLOR);
          self._updateInProgress = false;
        }
      };

      // Add listener before injecting script
      this.currentBrowser.messageManager.addMessageListener(
        "DynamicTheme:ContentHTML",
        messageListener,
      );

      // Now inject frame script
      if (window.messageManager && window.messageManager.loadFrameScript) {
        let uri = "chrome://frame-scripts/content/dynamicTheme_frameScript.js";
        window.messageManager.loadFrameScript(uri, true);
        self.log("Frame script injected: dynamicTheme_frameScript.js");
      } else {
        console.error(
          "Message manager not available; cannot load frame script.",
        );
        this._updateInProgress = false;
        return;
      }

      // Set a timeout in case we never get a message from the frame script
      setTimeout(() => {
        if (self._updateInProgress) {
          if (retryCount < self.MAX_RETRIES - 1) {
            self.log(
              `No color found yet, retrying (${retryCount + 1}/${
                self.MAX_RETRIES
              })...`,
              retryCount,
              "retrying updateThemeForCurrentTab with timeout",
            );

            // Remove stale listener before retrying
            self.currentBrowser.messageManager.removeMessageListener(
              "DynamicTheme:ContentHTML",
              messageListener,
            );

            self._updateInProgress = false; // Release lock before retrying
            self.updateThemeForCurrentTab(retryCount + 1);
          } else {
            self.log(
              "Max retries exceeded, using default color, reason is we couldn't find a color",
              "",
              "MaxRetriesExceeded",
            );
            self.applyColor(self.DEFAULT_COLOR);
            self._updateInProgress = false;
          }
        }
      }, 500);
    } catch (e) {
      console.error("[DynamicTheme] Error updating theme:", e);
      this.applyColor(this.DEFAULT_COLOR);
      this._updateInProgress = false;
    }
  },

  // Helper to calculate element's depth in the DOM
  getElementDepth(element) {
    let depth = 0;
    let current = element;
    while (current.parentNode) {
      depth++;
      current = current.parentNode;
    }
    return depth;
  },

  extractColorFromPage(html, hostname) {
    this.log(
      "Extracting color from page HTML",
      hostname,
      "extractColorFromPage",
    );
    const contentDocument = new DOMParser().parseFromString(html, "text/html");
    if (!contentDocument) {
      this.log("Failed to parse HTML");
      return null;
    }

    try {
      // 1. Check meta theme-color tag (most reliable when available)
      const metaThemeColor = contentDocument.querySelector(
        'meta[name="theme-color"]',
      );
      if (metaThemeColor && metaThemeColor.content) {
        const color = this.normalizeColor(metaThemeColor.content);
        if (this.isUsableColor(color)) {
          this.log(`Found meta theme-color:`, color);
          return color;
        }
      }

      // 2. Check for additional meta tags with theme colors
      const additionalMetaTags = [
        'meta[property="og:theme-color"]',
        'meta[name="og:theme-color"]',
        'meta[name="msapplication-TileColor"]',
        'meta[name="apple-mobile-web-app-status-bar-style"]',
        'meta[name="color-scheme"]',
        'meta[name="theme-color-light"]',
        'meta[name="theme-color-dark"]',
      ];

      for (const selector of additionalMetaTags) {
        const metaTag = contentDocument.querySelector(selector);
        if (metaTag && metaTag.content && metaTag.content !== "default") {
          const color = this.normalizeColor(metaTag.content);
          if (this.isUsableColor(color)) {
            this.log(`Found color from ${selector}:`, color);
            return color;
          }
        }
      }

      // 3. Look for CSS custom properties in inline styles
      const cssVarColor = this.extractCSSVars(contentDocument);
      if (cssVarColor) {
        this.log("Found color from CSS variables:", cssVarColor);
        return cssVarColor;
      }

      // 4. Check common brand color classes (Bootstrap, Tailwind, etc.)
      const frameworkColor = this.checkFrameworkColors(contentDocument);
      if (frameworkColor) {
        this.log("Found color from framework classes:", frameworkColor);
        return frameworkColor;
      }

      // 5. Look for color in SVG elements (logos)
      const svgColor = this.extractSVGColors(contentDocument);
      if (svgColor) {
        this.log("Found color from SVG:", svgColor);
        return svgColor;
      }

      // 6. Fallback to the improved findProminentColor function
      return this.findProminentColor(contentDocument, hostname);
    } catch (e) {
      console.error("[DynamicTheme] Error extracting color:", e);
      return null;
    }
  },

  // Extract colors from CSS variables in styles
  extractCSSVars(document) {
    try {
      // Common brand-related CSS variable names
      const brandVarNames = [
        "--primary",
        "--primary-color",
        "--color-primary",
        "--brand",
        "--brand-color",
        "--color-brand",
        "--theme",
        "--theme-color",
        "--color-theme",
        "--accent",
        "--accent-color",
        "--color-accent",
        "--main",
        "--main-color",
        "--color-main",
        "--bg-primary",
        "--background-primary",
        "--tw-bg-primary",
        "--tw-primary",
      ];

      // Check for inline styles with CSS variables
      const elementsWithStyle = document.querySelectorAll("[style]");
      for (const el of elementsWithStyle) {
        const styleAttr = el.getAttribute("style");
        if (!styleAttr) continue;

        for (const varName of brandVarNames) {
          const regex = new RegExp(`${varName}\\s*:\\s*(.+?)(;|$)`, "i");
          const match = styleAttr.match(regex);
          if (match && match[1]) {
            const color = this.normalizeColor(match[1].trim());
            if (this.isUsableColor(color)) {
              return color;
            }
          }
        }
      }

      // Check inline style tags for CSS variable definitions
      const styleTags = document.querySelectorAll("style");
      for (const styleTag of styleTags) {
        const cssText = styleTag.textContent;
        if (!cssText) continue;

        // Look for :root or body declarations with CSS variables
        const rootVarRegex = /:root\s*{([^}]*)}/g;
        const bodyVarRegex = /body\s*{([^}]*)}/g;

        const checkDeclaration = (declaration) => {
          for (const varName of brandVarNames) {
            const varRegex = new RegExp(`${varName}\\s*:\\s*(.+?)(;|$)`, "i");
            const match = declaration.match(varRegex);
            if (match && match[1]) {
              const color = this.normalizeColor(match[1].trim());
              if (this.isUsableColor(color)) {
                return color;
              }
            }
          }
          return null;
        };

        // Check :root variables
        let match = rootVarRegex.exec(cssText);
        if (match && match[1]) {
          const color = checkDeclaration(match[1]);
          if (color) return color;
        }

        // Check body variables
        match = bodyVarRegex.exec(cssText);
        if (match && match[1]) {
          const color = checkDeclaration(match[1]);
          if (color) return color;
        }
      }

      return null;
    } catch (e) {
      this.log("Error extracting CSS variables:", e);
      return null;
    }
  },

  // Check for framework-based color classes (Tailwind, Bootstrap, etc.)
  checkFrameworkColors(document) {
    try {
      // Tailwind CSS primary color classes
      const tailwindPrimaryClasses = [
        ".bg-primary",
        ".bg-blue-500",
        ".bg-blue-600",
        ".bg-indigo-500",
        ".bg-indigo-600",
        ".bg-purple-500",
        ".bg-purple-600",
        ".bg-red-500",
        ".bg-red-600",
        ".bg-green-500",
        ".bg-green-600",
        ".bg-pink-500",
        ".bg-pink-600",
        ".bg-yellow-500",
        ".bg-yellow-600",
        '[class*="bg-primary"]',
        '[class*="primary-bg"]',
      ];

      // Bootstrap and other framework primary classes
      const otherFrameworkClasses = [
        ".btn-primary",
        ".button-primary",
        ".primary-button",
        ".navbar-primary",
        ".bg-primary",
        ".primary-bg",
        ".cta",
        ".cta-primary",
        ".btn-cta",
        ".button-cta",
        ".action-button",
        ".main-action",
        ".primary-action",
      ];

      // Combined list of all framework classes to check
      const allFrameworkClasses = [
        ...tailwindPrimaryClasses,
        ...otherFrameworkClasses,
      ];

      for (const selector of allFrameworkClasses) {
        const elements = document.querySelectorAll(selector);
        if (elements.length === 0) continue;

        for (const el of elements) {
          // Skip very small elements
          const rect = el.getBoundingClientRect();
          if (rect.width < 20 || rect.height < 20) continue;

          // Check for inline background color
          if (el.hasAttribute("style")) {
            const style = el.getAttribute("style");
            const bgMatch = style.match(
              /background(-color)?:\s*(#[0-9a-f]{3,8}|rgb\(.*?\)|rgba\(.*?\))/i,
            );
            if (bgMatch && bgMatch[2]) {
              const color = this.normalizeColor(bgMatch[2]);
              if (this.isUsableColor(color)) return color;
            }
          }

          // Analyze class names for Tailwind colors
          if (el.hasAttribute("class")) {
            const classNames = el.getAttribute("class").split(/\s+/);
            for (const className of classNames) {
              // Look for Tailwind color classes (bg-{color}-{shade})
              const tailwindMatch = className.match(
                /^bg-(blue|red|green|yellow|purple|pink|indigo|teal|orange|cyan)-(400|500|600|700)$/,
              );
              if (tailwindMatch) {
                const colorName = tailwindMatch[1];
                const shade = parseInt(tailwindMatch[2]);

                // Map Tailwind color names and shades to hex values (approximate)
                const tailwindColorMap = {
                  blue: {
                    400: "#3B82F6",
                    500: "#3B82F6",
                    600: "#2563EB",
                    700: "#1D4ED8",
                  },
                  red: {
                    400: "#F87171",
                    500: "#EF4444",
                    600: "#DC2626",
                    700: "#B91C1C",
                  },
                  green: {
                    400: "#4ADE80",
                    500: "#22C55E",
                    600: "#16A34A",
                    700: "#15803D",
                  },
                  yellow: {
                    400: "#FACC15",
                    500: "#EAB308",
                    600: "#CA8A04",
                    700: "#A16207",
                  },
                  purple: {
                    400: "#C084FC",
                    500: "#A855F7",
                    600: "#9333EA",
                    700: "#7E22CE",
                  },
                  pink: {
                    400: "#F472B6",
                    500: "#EC4899",
                    600: "#DB2777",
                    700: "#BE185D",
                  },
                  indigo: {
                    400: "#818CF8",
                    500: "#6366F1",
                    600: "#4F46E5",
                    700: "#4338CA",
                  },
                  teal: {
                    400: "#2DD4BF",
                    500: "#14B8A6",
                    600: "#0D9488",
                    700: "#0F766E",
                  },
                  orange: {
                    400: "#FB923C",
                    500: "#F97316",
                    600: "#EA580C",
                    700: "#C2410C",
                  },
                  cyan: {
                    400: "#22D3EE",
                    500: "#06B6D4",
                    600: "#0891B2",
                    700: "#0E7490",
                  },
                };

                if (
                  tailwindColorMap[colorName] &&
                  tailwindColorMap[colorName][shade]
                ) {
                  return tailwindColorMap[colorName][shade];
                }
              }
            }
          }
        }
      }

      // Check for primary/action buttons
      const buttonElements = document.querySelectorAll(
        'button, [role="button"], a.btn, a.button, .btn, .button',
      );
      for (const button of buttonElements) {
        // Skip hidden or very small buttons
        const rect = button.getBoundingClientRect();
        if (rect.width < 20 || rect.height < 20) continue;

        // Check for inline background color
        if (button.hasAttribute("style")) {
          const style = button.getAttribute("style");
          const bgMatch = style.match(
            /background(-color)?:\s*(#[0-9a-f]{3,8}|rgb\(.*?\)|rgba\(.*?\))/i,
          );
          if (bgMatch && bgMatch[2]) {
            const color = this.normalizeColor(bgMatch[2]);
            if (this.isUsableColor(color)) return color;
          }
        }
      }

      return null;
    } catch (e) {
      this.log("Error checking framework colors:", e);
      return null;
    }
  },

  // Extract colors from SVG elements
  extractSVGColors(document) {
    try {
      // Find SVGs that might be logos
      const svgs = document.querySelectorAll("svg");
      const potentialLogoSVGs = [];

      for (const svg of svgs) {
        // Skip very small or hidden SVGs
        const width = parseInt(svg.getAttribute("width")) || 0;
        const height = parseInt(svg.getAttribute("height")) || 0;

        // Check if this might be a logo (either has "logo" in class/id or is in a typical logo position)
        const isLogo =
          (svg.id && svg.id.toLowerCase().includes("logo")) ||
          (svg.className &&
            svg.className.toString().toLowerCase().includes("logo")) ||
          (svg.parentElement &&
            svg.parentElement.id &&
            svg.parentElement.id.toLowerCase().includes("logo")) ||
          (svg.parentElement.className &&
            svg.parentElement.className
              .toString()
              .toLowerCase()
              .includes("logo"));

        if (isLogo) {
          potentialLogoSVGs.push(svg);
        }
      }

      // Process potential logo SVGs
      for (const svg of potentialLogoSVGs) {
        // Check the SVG itself for a fill attribute
        if (svg.hasAttribute("fill") && svg.getAttribute("fill") !== "none") {
          const fillColor = this.normalizeColor(svg.getAttribute("fill"));
          if (this.isUsableColor(fillColor)) {
            return fillColor;
          }
        }

        // Check paths, circles, rects with fill attributes
        const colorElements = svg.querySelectorAll(
          "path[fill], circle[fill], rect[fill], polygon[fill]",
        );
        for (const el of colorElements) {
          const fill = el.getAttribute("fill");
          if (fill && fill !== "none" && fill !== "transparent") {
            const color = this.normalizeColor(fill);
            if (this.isUsableColor(color)) {
              return color;
            }
          }
        }

        // Look for style elements within the SVG
        const styleElements = svg.querySelectorAll("style");
        for (const style of styleElements) {
          const cssText = style.textContent;
          if (!cssText) continue;

          // Look for fill colors in the CSS
          const fillMatch = cssText.match(
            /fill:\s*(#[0-9a-f]{3,8}|rgb\(.*?\)|rgba\(.*?\))/i,
          );
          if (fillMatch && fillMatch[1]) {
            const color = this.normalizeColor(fillMatch[1]);
            if (this.isUsableColor(color)) {
              return color;
            }
          }
        }
      }

      return null;
    } catch (e) {
      this.log("Error extracting SVG colors:", e);
      return null;
    }
  },

  // Improved prominent color finder
  findProminentColor(doc, hostname) {
    try {
      // Priority elements to check (in order of importance)
      const prioritySelectors = [
        // Headers and primary navigation
        "header",
        "nav",
        "#header",
        "#nav",
        ".header",
        ".navbar",
        ".navigation",

        // Logo containers
        '[class*="logo"]',
        '[id*="logo"]',
        '[class*="brand"]',
        '[id*="brand"]',

        // Common site header elements
        ".site-header",
        ".main-header",
        ".page-header",
        ".global-header",

        // App bars and mastheads
        "#masthead",
        ".masthead",
        "#appbar",
        "#app-bar",
        ".app-header",

        // Primary action elements
        "button.primary",
        ".primary-button",
        ".btn-primary",
        ".cta-button",

        // Important container elements
        ".hero",
        ".banner",
        ".jumbotron",
        ".showcase",
        ".feature",

        // Drawer and sidebar elements
        ".drawer",
        ".sidebar",
        "#sidebar",
        "#drawer",
        ".side-menu",
        "#side-menu",

        // Common container elements
        ".container-fluid > div:first-child",
        ".wrapper > div:first-child",

        // Generic common elements
        "main > div:first-child",
        "body > div:first-child",
      ];

      // Map to store colors and their importance scores
      const colorMap = new Map();

      // Check each selector in priority order
      for (const selector of prioritySelectors) {
        try {
          const elements = doc.querySelectorAll(selector);
          if (elements.length === 0) continue;

          for (const element of elements) {
            if (!element) continue;

            // Skip if element is very small or not visible
            const rect = element.getBoundingClientRect();
            if (rect.width < 20 || rect.height < 20) continue;

            // Calculate base priority based on selector position (earlier selectors get higher priority)
            let basePriority =
              prioritySelectors.length - prioritySelectors.indexOf(selector);

            // Check for inline background color
            if (element.hasAttribute("style")) {
              const style = element.getAttribute("style");
              const bgMatch = style.match(
                /background(-color)?:\s*(#[0-9a-f]{3,8}|rgb\(.*?\)|rgba\(.*?\))/i,
              );
              if (bgMatch && bgMatch[2]) {
                const color = this.normalizeColor(bgMatch[2]);
                if (this.isUsableColor(color)) {
                  // Calculate score based on element size and priority
                  const area = rect.width * rect.height;
                  const depth = this.getElementDepth(element);
                  const score = basePriority * 10 + area / 10000 - depth * 0.5;

                  if (!colorMap.has(color)) {
                    colorMap.set(color, score);
                  } else {
                    // If we've seen this color before, add to its score
                    colorMap.set(color, colorMap.get(color) + score);
                  }
                }
              }
            }

            // Check for gradient backgrounds
            if (element.hasAttribute("style")) {
              const style = element.getAttribute("style");
              const bgImage = style.match(
                /background(-image)?:\s*(.*?)(?:;|$)/i,
              );
              if (bgImage && bgImage[2] && bgImage[2].includes("gradient")) {
                const gradientColors = bgImage[2].match(
                  /#[0-9a-f]{3,8}|rgb\([^)]+\)|rgba\([^)]+\)/gi,
                );
                if (gradientColors) {
                  for (const colorStr of gradientColors) {
                    const color = this.normalizeColor(colorStr);
                    if (this.isUsableColor(color)) {
                      // Give gradient colors slightly lower priority
                      const score =
                        basePriority * 8 + (rect.width * rect.height) / 15000;

                      if (!colorMap.has(color)) {
                        colorMap.set(color, score);
                      } else {
                        colorMap.set(color, colorMap.get(color) + score);
                      }
                    }
                  }
                }
              }
            }

            // Check for class names that might indicate color
            if (element.className) {
              const classList = element.className.toString().split(/\s+/);
              for (const className of classList) {
                // Look for color indicators in class names
                if (/primary|brand|main|accent|theme/i.test(className)) {
                  // Boost the importance of this element
                  basePriority += 5;
                }

                // Check for Tailwind color classes
                const tailwindMatch = className.match(
                  /^bg-(blue|red|green|yellow|purple|pink|indigo|teal|orange|cyan)-(400|500|600|700)$/,
                );
                if (tailwindMatch) {
                  const colorName = tailwindMatch[1];
                  const shade = parseInt(tailwindMatch[2]);

                  // Map Tailwind color names and shades to hex values
                  const tailwindColorMap = {
                    blue: {
                      400: "#3B82F6",
                      500: "#3B82F6",
                      600: "#2563EB",
                      700: "#1D4ED8",
                    },
                    red: {
                      400: "#F87171",
                      500: "#EF4444",
                      600: "#DC2626",
                      700: "#B91C1C",
                    },
                    green: {
                      400: "#4ADE80",
                      500: "#22C55E",
                      600: "#16A34A",
                      700: "#15803D",
                    },
                    yellow: {
                      400: "#FACC15",
                      500: "#EAB308",
                      600: "#CA8A04",
                      700: "#A16207",
                    },
                    purple: {
                      400: "#C084FC",
                      500: "#A855F7",
                      600: "#9333EA",
                      700: "#7E22CE",
                    },
                    pink: {
                      400: "#F472B6",
                      500: "#EC4899",
                      600: "#DB2777",
                      700: "#BE185D",
                    },
                    indigo: {
                      400: "#818CF8",
                      500: "#6366F1",
                      600: "#4F46E5",
                      700: "#4338CA",
                    },
                    teal: {
                      400: "#2DD4BF",
                      500: "#14B8A6",
                      600: "#0D9488",
                      700: "#0F766E",
                    },
                    orange: {
                      400: "#FB923C",
                      500: "#F97316",
                      600: "#EA580C",
                      700: "#C2410C",
                    },
                    cyan: {
                      400: "#22D3EE",
                      500: "#06B6D4",
                      600: "#0891B2",
                      700: "#0E7490",
                    },
                  };

                  if (
                    tailwindColorMap[colorName] &&
                    tailwindColorMap[colorName][shade]
                  ) {
                    const color = tailwindColorMap[colorName][shade];
                    const score = basePriority * 15; // High score for explicit Tailwind colors

                    if (!colorMap.has(color)) {
                      colorMap.set(color, score);
                    } else {
                      colorMap.set(color, colorMap.get(color) + score);
                    }
                  }
                }
              }
            }
          }
        } catch (selectorError) {
          // Skip this selector if there's an error
          continue;
        }
      }

      // If we found colors, find the one with the highest score
      if (colorMap.size > 0) {
        // Convert to array and sort by score (highest first)
        const sortedColors = [...colorMap.entries()].sort(
          (a, b) => b[1] - a[1],
        );

        this.log(
          `Found ${sortedColors.length} potential colors, selecting best match:`,
          sortedColors[0][0],
        );
        return sortedColors[0][0];
      }

      // As a last resort, check the body background
      try {
        const bodyBg = this.normalizeColor(doc.body.style.backgroundColor);
        if (this.isUsableColor(bodyBg)) {
          this.log(`Using body background color:`, bodyBg);
          return bodyBg;
        }
      } catch (e) {
        // Continue if this fails
      }

      return null;
    } catch (e) {
      this.log("Error in findProminentColor:", e);
      return null;
    }
  },

  // Apply color to Firefox UI elements
  applyColor(color) {
    if (!color) color = this.DEFAULT_COLOR;

    this.log("Applying color", color);

    // Ensure the color has good contrast with white text
    color = this.ensureReadableColor(color);

    // Apply to the active tab background
    const dynamicStyle =
      document.getElementById("dynamic-tab-colors") ||
      (() => {
        const style = document.createElement("style");
        style.id = "dynamic-tab-colors";
        document.head.appendChild(style);
        return style;
      })();

    // Set all the necessary CSS rules for UI elements
    dynamicStyle.textContent = `
      .tab-background[selected="true"],
      .tabbrowser-tab[selected="true"] .tab-background {
        background-color: ${color} !important;
        background-image: none !important;
      }
      #urlbar-background {
        background-color: ${color} !important;
      }
      #navigator-toolbox {
        --lwt-accent-color: ${color} !important;
      }
      .tabbrowser-tab[selected="true"] {
        color: white !important;
      }
    `;
    this.html = null;
  },

  // Color utility functions
  normalizeColor(color) {
    if (!color) return null;

    // Handle hex format
    if (color.startsWith("#")) {
      // Expand short hex format
      if (color.length === 4) {
        return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
      }
      return color;
    }

    // Handle rgb/rgba formats
    if (color.startsWith("rgb")) {
      const match = color.match(/\d+/g);
      if (match && match.length >= 3) {
        const r = parseInt(match[0]).toString(16).padStart(2, "0");
        const g = parseInt(match[1]).toString(16).padStart(2, "0");
        const b = parseInt(match[2]).toString(16).padStart(2, "0");
        return `#${r}${g}${b}`;
      }
    }

    // Handle transparent or empty colors
    if (!color || color === "transparent" || color === "rgba(0, 0, 0, 0)") {
      return null;
    }

    // Handle named colors by creating a temporary element
    try {
      const temp = document.createElement("div");
      temp.style.color = color;
      document.body.appendChild(temp);
      const computed = window.getComputedStyle(temp).color;
      document.body.removeChild(temp);
      return this.normalizeColor(computed);
    } catch (e) {
      console.error("[DynamicTheme] Error converting color:", e);
      return null;
    }
  },

  // Determine if a color is usable (not too light/dark/desaturated)
  isUsableColor(hex) {
    if (!hex || hex === "#ffffff" || hex === "#000000") return false;

    // Convert hex to RGB
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    // Calculate brightness (0-255)
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;

    // Calculate saturation
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    const saturation = max === 0 ? 0 : delta / max;

    // Reject too light, too dark or too gray colors
    if (brightness < 30 || brightness > 225) return false;
    if (saturation < 0.1) return false;

    return true;
  },

  // Ensure the color has enough contrast with white text
  ensureReadableColor(color) {
    if (!color) return this.DEFAULT_COLOR;

    const hex = this.normalizeColor(color);
    if (!hex) {
      this.log("Invalid color, using default");
      return this.DEFAULT_COLOR;
    }

    // Convert hex to RGB
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    // Calculate luminance
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    // If luminance is too high (too bright), darken the color
    if (luminance > 0.5) {
      const darkenFactor = 0.6;
      const newR = Math.floor(r * darkenFactor * 255)
        .toString(16)
        .padStart(2, "0");
      const newG = Math.floor(g * darkenFactor * 255)
        .toString(16)
        .padStart(2, "0");
      const newB = Math.floor(b * darkenFactor * 255)
        .toString(16)
        .padStart(2, "0");
      return `#${newR}${newG}${newB}`;
    }

    return hex;
  },

  // Database of known website colors
  getKnownSiteColor(hostname) {
    const knownSites = [
      { domain: "youtube.com", color: "#FF0000" },
      { domain: "google.com", color: "#4285F4" },
      { domain: "facebook.com", color: "#1877F2" },
      { domain: "fb.com", color: "#1877F2" },
      { domain: "twitter.com", color: "#1DA1F2" },
      { domain: "x.com", color: "#000000" },
      { domain: "reddit.com", color: "#FF4500" },
      { domain: "pinterest.com", color: "#E60023" },
      { domain: "amazon.com", color: "#FF9900" },
      { domain: "netflix.com", color: "#E50914" },
      { domain: "github.com", color: "#171515" },
      { domain: "instagram.com", color: "#E1306C" },
      { domain: "linkedin.com", color: "#0A66C2" },
      { domain: "tumblr.com", color: "#34526F" },
      { domain: "twitch.tv", color: "#9146FF" },
      { domain: "wikipedia.org", color: "#000000" },
      { domain: "yahoo.com", color: "#6001D2" },
      { domain: "microsoft.com", color: "#00A4EF" },
      { domain: "apple.com", color: "#000000" },
      { domain: "bing.com", color: "#008373" },
      { domain: "slack.com", color: "#4A154B" },
      { domain: "claude.ai", color: "#ED9C48" },
      { domain: "anthropic.com", color: "#ED9C48" },
      { domain: "ebay.com", color: "#E53238" },
      { domain: "paypal.com", color: "#00457C" },
      { domain: "whatsapp.com", color: "#25D366" },
      { domain: "snapchat.com", color: "#FFFC00" },
      { domain: "tiktok.com", color: "#000000" },
      { domain: "spotify.com", color: "#1DB954" },
      { domain: "adobe.com", color: "#FF0000" },
      { domain: "dropbox.com", color: "#0061FF" },
      { domain: "salesforce.com", color: "#00A1E0" },
      { domain: "airbnb.com", color: "#FF5A5F" },
      { domain: "uber.com", color: "#000000" },
      { domain: "stackoverflow.com", color: "#cf5b00" },
    ];

    for (const site of knownSites) {
      if (hostname.includes(site.domain)) {
        return site.color;
      }
    }

    return null;
  },
};

// Initialize when browser is ready
if (gBrowserInit.delayedStartupFinished) {
  DynamicTheme.init();
} else {
  const delayedListener = (subject, topic) => {
    if (topic == "browser-delayed-startup-finished" && subject == window) {
      Services.obs.removeObserver(
        delayedListener,
        "browser-delayed-startup-finished",
      );
      DynamicTheme.init();
    }
  };
  Services.obs.addObserver(delayedListener, "browser-delayed-startup-finished");
}
