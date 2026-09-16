import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5174';
const OUTPUT_DIR = 'C:\\TeamSuite\\screenshots';

async function captureScreenshots() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  try {
    console.log('🚀 Starting screenshot capture...');
    
    // Login to DEMO
    console.log('📝 Logging in to DEMO...');
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    
    // Click DEMO button
    const demoButton = page.locator('text=Είσοδος DEMO παρουσίασης');
    if (await demoButton.isVisible()) {
      await demoButton.click();
      await page.waitForLoadState('networkidle');
      console.log('✅ Logged in to DEMO');
    }
    
    // Capture Dashboard
    console.log('📸 Capturing Dashboard...');
    await page.screenshot({ 
      path: `${OUTPUT_DIR}\\dashboard.png`,
      fullPage: false 
    });
    
    // Navigate to Calendar
    console.log('📸 Capturing Calendar...');
    await page.goto(`${BASE_URL}/calendar`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ 
      path: `${OUTPUT_DIR}\\calendar.png`,
      fullPage: false 
    });
    
    // Navigate to Athletes
    console.log('📸 Capturing Athletes...');
    await page.goto(`${BASE_URL}/athletes`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ 
      path: `${OUTPUT_DIR}\\athletes.png`,
      fullPage: false 
    });
    
    // Navigate to Finance
    console.log('📸 Capturing Finance...');
    await page.goto(`${BASE_URL}/finance`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ 
      path: `${OUTPUT_DIR}\\finance.png`,
      fullPage: false 
    });
    
    // Navigate to Settings
    console.log('📸 Capturing Settings...');
    await page.goto(`${BASE_URL}/settings`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ 
      path: `${OUTPUT_DIR}\\settings.png`,
      fullPage: false 
    });
    
    console.log('✅ All screenshots captured successfully!');
    
  } catch (error) {
    console.error('❌ Error capturing screenshots:', error);
  } finally {
    await browser.close();
  }
}

captureScreenshots();