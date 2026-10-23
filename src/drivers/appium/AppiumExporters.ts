import type { RecordedAction } from '../../recorder/Recorder';

const safeActions = (actions: RecordedAction[]): string => JSON.stringify(actions).replace(/</g, '\\u003c');

export function generateAppiumPython(actions: RecordedAction[]): string {
  return `# Requirements: Appium-Python-Client>=4,<6 selenium>=4.25,<5
import json, os, time
from appium import webdriver
from appium.options.android import UiAutomator2Options
from appium.webdriver.common.appiumby import AppiumBy
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.actions import interaction
from selenium.webdriver.common.actions.action_builder import ActionBuilder
from selenium.webdriver.common.actions.pointer_input import PointerInput

ACTIONS = json.loads(r'''${safeActions(actions)}''')
CAPABILITIES = {
    'platformName': 'Android', 'appium:automationName': 'UiAutomator2',
    'appium:deviceName': os.getenv('APPIUM_DEVICE_NAME', 'Android'),
}
if os.getenv('APPIUM_UDID'): CAPABILITIES['appium:udid'] = os.environ['APPIUM_UDID']
if os.getenv('APPIUM_APP_ID'): CAPABILITIES['appium:appPackage'] = os.environ['APPIUM_APP_ID']

def locator(selector):
    strategy, sep, value = selector.partition('=')
    if not sep: return AppiumBy.ACCESSIBILITY_ID, selector
    return {'accessibility id': AppiumBy.ACCESSIBILITY_ID, 'id': AppiumBy.ID,
            'xpath': AppiumBy.XPATH, 'class name': AppiumBy.CLASS_NAME,
            '-android uiautomator': AppiumBy.ANDROID_UIAUTOMATOR}.get(strategy, AppiumBy.ACCESSIBILITY_ID), value

driver = webdriver.Remote(os.getenv('APPIUM_URL', 'http://127.0.0.1:4723'), options=UiAutomator2Options().load_capabilities(CAPABILITIES))
try:
    for action in ACTIONS:
        kind, value, meta = action['type'], str(action.get('value') or ''), action.get('metadata') or {}
        if kind == 'wait': time.sleep(float(value or 0) / 1000); continue
        if kind == 'back': driver.back(); continue
        if kind == 'hideKeyboard': driver.hide_keyboard(); continue
        if kind == 'rotate': driver.orientation = value or 'PORTRAIT'; continue
        if kind == 'switchContext':
            deadline = time.time() + float(meta.get('timeoutMs', 20000)) / 1000
            while time.time() < deadline:
                target = next((c for c in driver.contexts if c == value or (value == 'WEBVIEW' and c.startswith('WEBVIEW'))), None)
                if target: driver.switch_to.context(target); break
                time.sleep(.25)
            else: raise TimeoutError('WebView context was not available')
            continue
        if kind == 'launchApp': driver.activate_app(value); continue
        if kind == 'terminateApp': driver.terminate_app(value); continue
        if kind == 'installApp': driver.install_app(value); continue
        if kind == 'mobileKey':
            driver.execute_script('mobile: pressKey', {'keycode': {'home': 3, 'enter': 66, 'go': 66, 'search': 84}[value.lower()]}); continue
        if kind == 'clearAppData': raise RuntimeError('clearAppData is intentionally not exported; run it through an approved device reset fixture')
        if kind == 'deepLink': driver.execute_script('mobile: deepLink', {'url': value, 'package': meta.get('package') or os.getenv('APPIUM_APP_ID', '')}); continue
        by, selector = locator(action['selector'])
        element = driver.find_element(by, selector)
        if kind in ('tap', 'click'): element.click()
        elif kind == 'input': element.send_keys(value)
        elif kind == 'clear': element.clear()
        elif kind == 'assert':
            expected = str(meta.get('expected', value))
            if expected not in element.text: raise AssertionError(f'Expected {expected!r} in {element.text!r}')
finally:
    driver.quit()
`;
}

export function generateAppiumJava(actions: RecordedAction[]): string {
  const encoded = Buffer.from(safeActions(actions), 'utf8').toString('base64');
  return `// Dependencies: io.appium:java-client:9.x, com.fasterxml.jackson.core:jackson-databind:2.x
import io.appium.java_client.AppiumBy;
import io.appium.java_client.android.AndroidDriver;
import io.appium.java_client.android.options.UiAutomator2Options;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.openqa.selenium.WebElement;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;

public final class OmniFlowQAAppiumTest {
  private static final String ACTIONS_BASE64 = "${encoded}";
  public static void main(String[] args) throws Exception {
    UiAutomator2Options options = new UiAutomator2Options()
      .setDeviceName(System.getenv().getOrDefault("APPIUM_DEVICE_NAME", "Android"));
    if (System.getenv("APPIUM_UDID") != null) options.setUdid(System.getenv("APPIUM_UDID"));
    AndroidDriver driver = new AndroidDriver(new URL(System.getenv().getOrDefault("APPIUM_URL", "http://127.0.0.1:4723")), options);
    List<Map<String,Object>> actions = new ObjectMapper().readValue(new String(Base64.getDecoder().decode(ACTIONS_BASE64), StandardCharsets.UTF_8), new TypeReference<>() {});
    try {
      for (Map<String,Object> action : actions) {
        String type = String.valueOf(action.get("type")); String value = String.valueOf(action.getOrDefault("value", ""));
        Map<String,Object> meta = (Map<String,Object>) action.getOrDefault("metadata", Map.of());
        if (type.equals("wait")) { Thread.sleep(Long.parseLong(value)); continue; }
        if (type.equals("back")) { driver.navigate().back(); continue; }
        if (type.equals("hideKeyboard")) { driver.hideKeyboard(); continue; }
        if (type.equals("rotate")) { driver.rotate(org.openqa.selenium.ScreenOrientation.valueOf(value.toUpperCase())); continue; }
        if (type.equals("switchContext")) {
          long deadline = System.nanoTime() + Duration.ofMillis(((Number)meta.getOrDefault("timeoutMs", 20000)).longValue()).toNanos();
          String target = null; while (System.nanoTime() < deadline && target == null) { target = driver.getContextHandles().stream().filter(c -> c.equals(value) || (value.equals("WEBVIEW") && c.startsWith("WEBVIEW"))).findFirst().orElse(null); if (target == null) Thread.sleep(250); }
          if (target == null) throw new IllegalStateException("WebView context was not available"); driver.context(target); continue;
        }
        if (type.equals("launchApp")) { driver.activateApp(value); continue; }
        if (type.equals("terminateApp")) { driver.terminateApp(value); continue; }
        if (type.equals("installApp")) { driver.installApp(value); continue; }
        if (type.equals("mobileKey")) { driver.executeScript("mobile: pressKey", Map.of("keycode", Map.of("home", 3, "enter", 66, "go", 66, "search", 84).get(value.toLowerCase()))); continue; }
        if (type.equals("clearAppData")) throw new IllegalStateException("clearAppData requires an approved device reset fixture");
        WebElement element = find(driver, String.valueOf(action.get("selector")));
        if (type.equals("tap") || type.equals("click")) element.click();
        else if (type.equals("input")) element.sendKeys(value);
        else if (type.equals("clear")) element.clear();
        else if (type.equals("assert") && !element.getText().contains(String.valueOf(meta.getOrDefault("expected", value)))) throw new AssertionError("Text assertion failed");
      }
    } finally { driver.quit(); }
  }
  private static WebElement find(AndroidDriver driver, String selector) {
    int index = selector.indexOf('='); String strategy = index < 0 ? "accessibility id" : selector.substring(0,index); String value = index < 0 ? selector : selector.substring(index+1);
    return driver.findElement(switch(strategy) { case "id" -> AppiumBy.id(value); case "xpath" -> AppiumBy.xpath(value); case "class name" -> AppiumBy.className(value); case "-android uiautomator" -> AppiumBy.androidUIAutomator(value); default -> AppiumBy.accessibilityId(value); });
  }
}
`;
}
