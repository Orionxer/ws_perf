const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function runTest() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    console.log('=== TEST: No video available scenario ===\n');
    
    console.log('STEP 1: Rename video file to simulate unavailable video');
    const videoPath = '/home/orionxer/ai/ws_perf/resource/starship.mp4';
    const backupPath = '/home/orionxer/ai/ws_perf/resource/starship.mp4.bak';
    
    if (fs.existsSync(videoPath)) {
      fs.renameSync(videoPath, backupPath);
      console.log('✓ Video file moved to backup');
    } else {
      console.log('✗ Video file not found');
    }
    
    console.log('\nSTEP 2: Navigate to dashboard');
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
    await page.waitForSelector('[role="application"]', { timeout: 5000 });
    console.log('✓ Dashboard loaded');
    
    console.log('\nSTEP 3: Wait for client card');
    let attempts = 0;
    while (attempts < 10) {
      const cardCount = await page.locator('button.client-card').count();
      if (cardCount > 0) {
        console.log('✓ Found client card');
        break;
      }
      await page.waitForTimeout(500);
      attempts++;
    }
    
    if (attempts >= 10) {
      console.log('✗ Client card not found after waiting');
      const pageText = await page.textContent('body');
      console.log('Page contains:', pageText ? pageText.substring(0, 300) : 'empty');
    } else {
      console.log('\nSTEP 4: Click on client card');
      await page.locator('button.client-card').first().click();
      await page.waitForTimeout(2000);
      
      console.log('✓ Client detail page loaded');
      
      console.log('\nSTEP 5: Check for "No video available" message');
      const pageContent = await page.textContent('body');
      
      if (pageContent && pageContent.includes('No video available')) {
        console.log('✓ "No video available" message is displayed');
      } else if (pageContent && pageContent.includes('Checking video')) {
        console.log('◆ "Checking video..." message is displayed (check in progress)');
      } else {
        console.log('✗ Expected message NOT found');
        console.log('Page content:', pageContent ? pageContent.substring(0, 300) : 'empty');
      }
      
      // Wait a bit more and check again
      await page.waitForTimeout(1500);
      const pageContent2 = await page.textContent('body');
      if (pageContent2 && pageContent2.includes('No video available')) {
        console.log('✓ "No video available" message appears after timeout');
      }
      
      // Take screenshot
      await page.screenshot({ path: '/tmp/dashboard_no_video.png' });
      console.log('✓ Screenshot saved: /tmp/dashboard_no_video.png');
    }
    
    console.log('\nSTEP 6: Restore video file');
    if (fs.existsSync(backupPath)) {
      fs.renameSync(backupPath, videoPath);
      console.log('✓ Video file restored');
    }
    
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    // Restore video file even if test fails
    const videoPath = '/home/orionxer/ai/ws_perf/resource/starship.mp4';
    const backupPath = '/home/orionxer/ai/ws_perf/resource/starship.mp4.bak';
    if (fs.existsSync(backupPath)) {
      fs.renameSync(backupPath, videoPath);
      console.log('✓ Video file restored after error');
    }
  } finally {
    await browser.close();
  }
}

runTest();
