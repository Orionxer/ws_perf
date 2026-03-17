const { chromium } = require('playwright');

async function runTest() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    console.log('=== STEP 1: Navigate to dashboard ===');
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
    const title = await page.title();
    console.log('✓ Dashboard loaded, title:', title);
    
    console.log('\n=== STEP 2: Check for application ===');
    await page.waitForSelector('[role="application"]', { timeout: 5000 });
    console.log('✓ Application loaded');
    
    // Take screenshot to see the current state
    await page.screenshot({ path: '/tmp/dashboard_list.png' });
    console.log('✓ Screenshot saved: /tmp/dashboard_list.png');
    
    // Wait a bit for client to appear
    await page.waitForTimeout(2000);
    
    console.log('\n=== STEP 3: Look for client cards ===');
    const buttons = await page.locator('button.client-card').count();
    console.log(`Found ${buttons} client card buttons`);
    
    if (buttons > 0) {
      console.log('\n=== STEP 4: Click on first client card ===');
      await page.locator('button.client-card').first().click();
      await page.waitForTimeout(1500);
      
      // Take screenshot of detail page
      await page.screenshot({ path: '/tmp/dashboard_detail.png' });
      console.log('✓ Screenshot saved: /tmp/dashboard_detail.png');
      
      console.log('\n=== STEP 5: Check for video player ===');
      const videoElements = await page.locator('video').count();
      console.log(`✓ Found ${videoElements} video elements`);
      
      const videoCard = await page.locator('.video-card').count();
      console.log(`✓ Found ${videoCard} video card(s)`);
      
      if (videoElements > 0) {
        const videoSources = await page.locator('video source').count();
        console.log(`✓ Found ${videoSources} video source elements`);
        
        const videoSrc = await page.getAttribute('video', 'src');
        console.log(`✓ Video src: ${videoSrc}`);
      }
      
      console.log('\n=== STEP 6: Check for video controls ===');
      const playBtn = await page.locator('#videoPlayBtn').count();
      console.log(`✓ Found ${playBtn} play button(s)`);
      
      const progressBar = await page.locator('#videoProgress').count();
      console.log(`✓ Found ${progressBar} progress bar(s)`);
      
      const timeDisplay = await page.locator('#videoTime').count();
      console.log(`✓ Found ${timeDisplay} time display element(s)`);
      
      console.log('\n=== STEP 7: Test play/pause functionality ===');
      if (playBtn > 0) {
        const initialBtnText = await page.locator('#videoPlayBtn').innerHTML();
        console.log(`Initial button state: ${initialBtnText}`);
        
        // Click play button
        await page.locator('#videoPlayBtn').click();
        await page.waitForTimeout(500);
        
        const videoState = await page.evaluate(() => {
          const v = document.getElementById('videoPlayer');
          return {
            paused: v ? v.paused : null,
            currentTime: v ? v.currentTime : null,
            duration: v ? v.duration : null
          };
        });
        
        console.log(`✓ Video state after play click:`, videoState);
        
        // Check progress bar
        const progressWidth = await page.locator('#videoProgressBar').evaluate(el => window.getComputedStyle(el).width);
        console.log(`✓ Progress bar width: ${progressWidth}`);
        
        // Get time display
        const timeText = await page.locator('#videoTime').textContent();
        console.log(`✓ Time display: ${timeText}`);
        
        // Wait for video to play a bit
        await page.waitForTimeout(2000);
        
        const videoStateAfterWait = await page.evaluate(() => {
          const v = document.getElementById('videoPlayer');
          return {
            paused: v ? v.paused : null,
            currentTime: v ? v.currentTime : null,
            duration: v ? v.duration : null
          };
        });
        
        console.log(`✓ Video state after waiting:`, videoStateAfterWait);
        
        // Click pause button
        await page.locator('#videoPlayBtn').click();
        await page.waitForTimeout(500);
        
        const videoStatePaused = await page.evaluate(() => {
          const v = document.getElementById('videoPlayer');
          return {
            paused: v ? v.paused : null,
            currentTime: v ? v.currentTime : null,
            duration: v ? v.duration : null
          };
        });
        
        console.log(`✓ Video state after pause click:`, videoStatePaused);
      }
      
      console.log('\n=== STEP 8: Check for console errors ===');
      const consoleErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });
      
      if (consoleErrors.length > 0) {
        console.log('Console errors:');
        consoleErrors.forEach(err => console.log('  ERROR: ' + err));
      } else {
        console.log('✓ No console errors detected');
      }
      
    } else {
      console.log('✗ No client cards found');
    }
    
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await browser.close();
  }
}

runTest();
