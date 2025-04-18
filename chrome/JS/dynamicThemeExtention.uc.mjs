// ==UserScript==
// @name           Dynamic Theme Exention
// @description    Exention to control the script that changes Zen UI colors based on the current website
// ==/UserScript==

// theme script import
import { DynamicTheme } from "chrome://userscripts/content/dynamicTheme.uc.mjs";

// iro import for color picker
import "chrome://userscripts/content/iro.uc.mjs";

// I/O imports
import {
  FileSystem,
  Hotkeys,
  Prefs,
  SharedStorage,
  Windows,
  Utils,
  Scripts,
} from "chrome://userchromejs/content/uc_api.sys.mjs";

const DynamicThemeExention = {
  IS_DEBUG_ENABLED: true,
  CONFIG_FILE_NAME: "DynamicTheme.DB.json",
  CURRENT_CONFIG: {},

  DEFAULT_CONFIG: {
    enabled: true,
    defaultColor: "#000000ff",
    contrastActive: 0.45,
    contrastInactive: 0.3,
    contrastSearchBar: 0.45,
    useCustomColors: false,
    customColors: [
      { domain: "youtube.com", color: "#00f729" },
      { domain: "google.com", color: "#4285F4" },
      { domain: "facebook.com", color: "#1877F2" },
      { domain: "fb.com", color: "#1877F2" },
      { domain: "twitter.com", color: "#1DA1F2" },
      { domain: "x.com", color: "#000000" },
      // { domain: "reddit.com", color: "#FF4500" },
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
      { domain: "tiktok.com", color: "#EE1D52" },
      { domain: "spotify.com", color: "#1DB954" },
      { domain: "adobe.com", color: "#FF0000" },
      { domain: "dropbox.com", color: "#0061FF" },
      { domain: "salesforce.com", color: "#00A1E0" },
      { domain: "airbnb.com", color: "#FF5A5F" },
      { domain: "uber.com", color: "#000000" },
      { domain: "stackoverflow.com", color: "#cf5b00" },
    ],
    devOptions: {
      enableLogging: true,
      usedCachedColors: true,
    },
  },

  log(message, data = "", what = "") {
    if (this.IS_DEBUG_ENABLED) {
      if (data && !what) {
        console.log(`[DynamicThemeExention] : ${message} \ndata : \n`, data);
      } else if (what && data) {
        console.log(
          `[DynamicThemeExention][${what}] : ${message} : \ndata : \n`,
          data,
        );
      } else if (what && !data) {
        console.log(`[DynamicThemeExention][${what}] : ${message}`);
      } else {
        console.log(`[DynamicThemeExention] : ${message}`);
      }
    }
  },

  error(message, data = "", error = "") {
    if (this.IS_DEBUG_ENABLED) {
      if (data && !error) {
        console.error(`[DynamicThemeExention] : ${message} \ndata : \n`, data);
      } else if (error && data) {
        console.error(
          `[DynamicThemeExention][${error}] : ${message} : \ndata : \n`,
          data,
        );
      } else if (error && !data) {
        console.error(`[DynamicThemeExention][${error}] : ${message}`);
      } else {
        console.error(`[DynamicThemeExention] : ${message}`);
      }
    }
  },

  initEventListener() {
    // event for extention main button click
    const DynamicThemeExentionButton = window.document.querySelector(
      "#DynamicThemeExentionButton",
    );
    DynamicThemeExentionButton.addEventListener("click", () => {
      if (DynamicThemeExentionButton.getAttribute("open")) {
        DynamicThemeExentionButton.removeAttribute("open");
        const container = window.document.querySelector(
          ".DynamicThemeExentionMenuContainer",
        );
        container.classList.add("DynamicThemeExentionMenuContainerHidden");
      } else {
        DynamicThemeExentionButton.setAttribute("open", "true");
        const container = window.document.querySelector(
          ".DynamicThemeExentionMenuContainer",
        );
        container.classList.remove("DynamicThemeExentionMenuContainerHidden");
      }
    });

    //event for clicking away from the main menu of the extention
    const MainAppContext = window.document.querySelector("#main-window");
    MainAppContext.addEventListener("click", (event) => {
      const container = window.document.querySelector(
        ".DynamicThemeExentionMenuContainer",
      );
      if (
        container &&
        DynamicThemeExentionButton &&
        DynamicThemeExentionButton.getAttribute("open") &&
        event.target != DynamicThemeExentionButton &&
        event.target != container &&
        !container.contains(event.target)
      ) {
        DynamicThemeExentionButton.removeAttribute("open");
        container.classList.add("DynamicThemeExentionMenuContainerHidden");
      }
    });

    //event listner for enable/disable extention
    const MainContainer = window.document.querySelector(
      ".DynamicThemeExentionMenuContainer",
    );
    const themeStateButton = MainContainer.querySelector("#themeStateButton");
    themeStateButton.addEventListener("click", (event) => {
      const settingsSection = MainContainer.querySelector(".extentionEnabled");
      if (event.target.checked) {
        this.CURRENT_CONFIG.enabled = true;
        this.writeUserConfig(this.CURRENT_CONFIG);
        DynamicTheme.updateUserConfigVars(this.CURRENT_CONFIG);
        DynamicTheme.addStyles();
        settingsSection.removeAttribute("disabled");
      } else {
        this.CURRENT_CONFIG.enabled = false;
        this.writeUserConfig(this.CURRENT_CONFIG);
        DynamicTheme.updateUserConfigVars(this.CURRENT_CONFIG);
        DynamicTheme.removeStyles();
        settingsSection.setAttribute("disabled", "disabled");
      }
      this.setThemeState(event.target.checked);
    });

    //event listner for active tab contrast slider
    const contrastSliderActive = MainContainer.querySelector(
      "#contrastSliderActive",
    );
    contrastSliderActive.addEventListener("change", (event) => {
      this.updateContrastActiveTabs(event.target.value);
    });

    //event listner for inactive tab contrast slider
    const contrastSliderInactive = MainContainer.querySelector(
      "#contrastSliderInactive",
    );
    contrastSliderInactive.addEventListener("change", (event) => {
      this.updateContrastInactiveTabs(event.target.value);
    });

    //event listner for searchbar contrast slider
    const contrastSearchBarSlider = MainContainer.querySelector(
      "#contrastSliderSearchBar",
    );
    contrastSearchBarSlider.addEventListener("change", (event) => {
      this.updateContrastSearchBar(event.target.value);
    });

    // advanced settings events section

    // use cached colors event
    const cacheColorsCheckbox = MainContainer.querySelector(
      "#cacheColorsCheckbox",
    );
    cacheColorsCheckbox.addEventListener("click", (event) => {
      this.updateCacheUsageState(event.target.checked);
    });

    // use custom colors event
    const customColorsCheckbox = MainContainer.querySelector(
      "#customColorsCheckbox",
    );
    customColorsCheckbox.addEventListener("click", (event) => {
      this.updateUseCustomColorsState(event.target.checked);
    });

    // enable debuging
    const enableDebugingCheckbox = MainAppContext.querySelector(
      "#enableDebugingCheckbox",
    );
    enableDebugingCheckbox.addEventListener("click", (event) => {
      this.updateEnableDebugingState(event.target.checked);
    });

    //color picker events
    const colorPickerTrigger = MainContainer.querySelector(
      "#colorPickerTrigger",
    );
    colorPickerTrigger.addEventListener("click", () => {
      this.showHideColorPicker();
    });

    MainAppContext.addEventListener("click", (event) => {
      const pickerContainer = window.document.querySelector(".pickerContainer");
      const colorPickerTrigger = window.document.querySelector(
        "#colorPickerTrigger",
      );
      if (
        !Array.from(pickerContainer.classList).includes(
          "pickerContainerHidden",
        ) &&
        event.target != pickerContainer &&
        event.target != colorPickerTrigger &&
        !pickerContainer.contains(event.target)
      ) {
        pickerContainer.classList.add("pickerContainerHidden");
      }
    });

    var colorPicker = new iro.ColorPicker(".colorPicker", {
      width: 280,
      color: this.CURRENT_CONFIG.defaultColor,
      borderWidth: 1,
      borderColor: "#fff",
    });

    var hexInput = MainContainer.querySelector("#hexInput");
    hexInput.value = this.CURRENT_CONFIG.defaultColor;
    // "color:init", "color:change";
    colorPicker.on(["input:end"], (color) => {
      hexInput.value = color.hexString;
      this.updatePickerTriggerColor(color.hexString);
    });

    hexInput.addEventListener("input", (event) => {
      colorPicker.color.hexString = event.target.value;
      this.updatePickerTriggerColor(event.target.value);
    });
  },

  addButtonToNav() {
    //query Nav
    const NavBar = window.document.querySelector(
      "#nav-bar-customization-target",
    );

    try {
      //button
      const DynamicThemeExentionButton =
        document.createXULElement("toolbarbutton");

      DynamicThemeExentionButton.setAttribute(
        "id",
        "DynamicThemeExentionButton",
      );
      DynamicThemeExentionButton.setAttribute(
        "class",
        "DynamicThemeExentionButton toolbarbutton-1 chromeclass-toolbar-additional subviewbutton-nav DynamicThemeExentionButtonImage",
      );
      DynamicThemeExentionButton.setAttribute("type", "menu");
      DynamicThemeExentionButton.setAttribute(
        "label",
        "Dynamic Theme Exention",
      );
      DynamicThemeExentionButton.classList.add(
        "DynamicThemeExentionButtonImage",
      );
      DynamicThemeExentionButton.setAttribute(
        "tooltip",
        "dynamic-shortcut-tooltip",
      );
      DynamicThemeExentionButton.setAttribute("delegatesanchor", "true");

      //apppend to Nav
      NavBar.appendChild(DynamicThemeExentionButton);
    } catch (e) {
      this.error("failed to add button to navBar!", null, e);
    }
  },

  showHideColorPicker() {
    const MainContainer = window.document.querySelector(
      ".DynamicThemeExentionMenuContainer",
    );
    const pickerContainer = MainContainer.querySelector(".pickerContainer");
    if (
      Array.from(pickerContainer.classList).includes("pickerContainerHidden")
    ) {
      pickerContainer.classList.remove("pickerContainerHidden");
    } else {
      pickerContainer.classList.add("pickerContainerHidden");
    }
  },

  async addExtentionSettingsPanel() {
    const MainAppContext = window.document.querySelector(
      "#zen-main-app-wrapper",
    );
    if (MainAppContext !== undefined && MainAppContext !== null) {
      const parser = new DOMParser();
      const extentionSettingsPanel = document.importNode(
        parser.parseFromString(
          await FileSystem.readFileSync("extentionSettings.html").content(),
          "text/html",
        ).body.firstChild,
        true,
      );
      MainAppContext.appendChild(extentionSettingsPanel);
    } else {
      this.error("failed to add dropDown to Main container!");
    }
  },

  async initUserConfig() {
    try {
      const fileExists = await this.checkFileExists(this.CONFIG_FILE_NAME);
      if (!fileExists) {
        this.log(
          "creating config file with default values...",
          this.DEFAULT_CONFIG,
        );
        await this.writeUserConfig(this.DEFAULT_CONFIG);
        this.CURRENT_CONFIG = this.DEFAULT_CONFIG;
      }
    } catch (e) {
      this.error("could not write file!", e);
    }
  },

  async checkFileExists(fileName) {
    let file = await FileSystem.readFileSync(fileName, {});
    return file.error() ? false : true;
  },

  async readUserConfig() {
    let file = await FileSystem.readFileSync(this.CONFIG_FILE_NAME, {});
    if (!file.error()) {
      try {
        this.CURRENT_CONFIG = JSON.parse(file.content());
      } catch (e) {
        this.error("failed to read json file", e);
      }
    }
  },

  async restUserConfig() {
    try {
      await this.writeUserConfig(this.DEFAULT_CONFIG);
      this.CURRENT_CONFIG = this.DEFAULT_CONFIG;
    } catch (e) {
      this.error("faied to rest user config!", e);
    }
  },

  async writeUserConfig(config) {
    try {
      Prefs.set("userChromeJS.allowUnsafeWrites", true);
      let jsonData = JSON.stringify(config, null, 2);
      await FileSystem.writeFile(this.CONFIG_FILE_NAME, jsonData);
    } catch (e) {
      this.error("could not write file!", e);
    }
  },

  async setThemeState(state) {
    this.CURRENT_CONFIG.enabled = state;
    await this.writeUserConfig(this.CURRENT_CONFIG);
  },

  updateUIState() {
    const MainContainer = window.document.querySelector(
      ".DynamicThemeExentionMenuContainer",
    );

    const themeStateButton = MainContainer.querySelector("#themeStateButton");

    themeStateButton.checked = this.CURRENT_CONFIG.enabled;

    const contrastSliderActive = MainContainer.querySelector(
      "#contrastSliderActive",
    );
    contrastSliderActive.setAttribute(
      "value",
      this.CURRENT_CONFIG.contrastActive,
    );

    const contrastSliderInactive = MainContainer.querySelector(
      "#contrastSliderInactive",
    );
    contrastSliderInactive.setAttribute(
      "value",
      this.CURRENT_CONFIG.contrastInactive,
    );

    const contrastSliderSearchBar = MainContainer.querySelector(
      "#contrastSliderSearchBar",
    );
    contrastSliderSearchBar.setAttribute(
      "value",
      this.CURRENT_CONFIG.contrastSearchBar,
    );

    const cacheColorsCheckbox = MainContainer.querySelector(
      "#cacheColorsCheckbox",
    );
    cacheColorsCheckbox.checked =
      this.CURRENT_CONFIG.devOptions.usedCachedColors;

    const customColorsCheckbox = MainContainer.querySelector(
      "#customColorsCheckbox",
    );
    customColorsCheckbox.checked = this.CURRENT_CONFIG.useCustomColors;

    const enableDebugingCheckbox = MainContainer.querySelector(
      "#enableDebugingCheckbox",
    );
    enableDebugingCheckbox.checked =
      this.CURRENT_CONFIG.devOptions.enableLogging;
    // fallback color set
    this.updatePickerTriggerColor(this.CURRENT_CONFIG.defaultColor);
  },

  updatePickerTriggerColor(hexColor) {
    const MainContainer = window.document.querySelector(
      ".DynamicThemeExentionMenuContainer",
    );

    const colorPickerTrigger = MainContainer.querySelector(
      "#colorPickerTrigger",
    );

    colorPickerTrigger.setAttribute(
      "style",
      `background-color :${hexColor} !important;`,
    );
    this.CURRENT_CONFIG.defaultColor = hexColor;
    this.writeUserConfig(this.CURRENT_CONFIG);
    this.ApplyConfig();
  },

  ApplyConfig() {
    // Initial run in case of tabs existing on browser open
    if (this.CURRENT_CONFIG.enabled) {
      DynamicTheme.updateUserConfigVars(this.CURRENT_CONFIG);
      // DynamicTheme.removeStyles();
      if (this.CURRENT_CONFIG.enabled) {
        DynamicTheme.addStyles();
      } else {
        DynamicTheme.removeStyles();
      }
    }
  },

  updateContrastActiveTabs(value) {
    this.CURRENT_CONFIG.contrastActive = value;
    this.writeUserConfig(this.CURRENT_CONFIG);
    this.ApplyConfig();
  },

  updateContrastInactiveTabs(value) {
    this.CURRENT_CONFIG.contrastInactive = value;
    this.writeUserConfig(this.CURRENT_CONFIG);
    this.ApplyConfig();
  },

  updateContrastSearchBar(value) {
    this.CURRENT_CONFIG.contrastSearchBar = value;
    this.writeUserConfig(this.CURRENT_CONFIG);
    this.ApplyConfig();
  },

  updateCacheUsageState(value) {
    this.CURRENT_CONFIG.devOptions.usedCachedColors = value;
    this.writeUserConfig(this.CURRENT_CONFIG);
    this.ApplyConfig();
  },

  updateUseCustomColorsState(value) {
    this.CURRENT_CONFIG.useCustomColors = value;
    this.writeUserConfig(this.CURRENT_CONFIG);
    this.ApplyConfig();
  },

  updateEnableDebugingState(value) {
    this.CURRENT_CONFIG.devOptions.enableLogging = value;
    this.writeUserConfig(this.CURRENT_CONFIG);
    DynamicTheme.updateUserConfigVars(this.CURRENT_CONFIG);
  },

  async initExtention() {
    // Initialize when browser is ready
    await this.initUserConfig();
    await this.readUserConfig();
    this.addButtonToNav();
    await this.addExtentionSettingsPanel();
    this.initEventListener();
    DynamicTheme.globalInit(this.CURRENT_CONFIG);
    this.updateUIState();
    this.log("DynamicThemeExention initialized");
  },
};

await DynamicThemeExention.initExtention();
