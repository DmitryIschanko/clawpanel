import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost';
const USERNAME = 'admin';
const PASSWORD = 'admin';

test.describe('MCP Happy Path E2E', () => {
  
  test('complete MCP import and tool sync flow', async ({ page }) => {
    // Step 1: Login
    console.log('Step 1: Logging in...');
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="text"]', USERNAME);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    
    // Wait for navigation to dashboard
    await page.waitForURL(/dashboard|/);
    console.log('✓ Logged in successfully');
    
    // Step 2: Navigate to MCP Servers page
    console.log('Step 2: Navigating to MCP Servers...');
    await page.click('text=MCP Servers');
    await page.waitForURL(/mcp|mcp-servers/);
    console.log('✓ On MCP Servers page');
    
    // Step 3: Click Import JSON button
    console.log('Step 3: Opening Import JSON modal...');
    await page.click('text=Import JSON');
    await page.waitForSelector('textarea');
    console.log('✓ Import modal opened');
    
    // Step 4: Fill MCP JSON config
    console.log('Step 4: Filling MCP config...');
    const mcpConfig = {
      name: `E2E Test MCP ${Date.now()}`,
      url: 'https://api.example.com/mcp',
      auth: {
        type: 'api_key',
        apiKey: 'test-api-key'
      },
      tools: [
        { name: 'search_web', description: 'Search the web' },
        { name: 'fetch_data', description: 'Fetch data from URL' }
      ]
    };
    
    await page.fill('textarea', JSON.stringify(mcpConfig, null, 2));
    console.log('✓ Config filled');
    
    // Step 5: Submit import
    console.log('Step 5: Submitting import...');
    await page.click('button:has-text("Import")');
    
    // Wait for modal to close
    await page.waitForTimeout(2000);
    console.log('✓ Import submitted');
    
    // Step 6: Verify MCP server appears in list
    console.log('Step 6: Verifying MCP server in list...');
    await page.waitForSelector(`text=${mcpConfig.name}`, { timeout: 5000 });
    const serverElement = await page.locator(`text=${mcpConfig.name}`).first();
    await expect(serverElement).toBeVisible();
    console.log('✓ MCP server appears in list');
    
    // Step 7: Navigate to Tools page
    console.log('Step 7: Checking Tools page...');
    await page.click('text=Tools');
    await page.waitForURL(/tools/);
    console.log('✓ On Tools page');
    
    // Step 8: Verify MCP tools are synced
    console.log('Step 8: Verifying synced tools...');
    await page.waitForSelector('text=search_web', { timeout: 5000 });
    await page.waitForSelector('text=fetch_data', { timeout: 5000 });
    
    const searchTool = await page.locator('text=search_web').first();
    const fetchTool = await page.locator('text=fetch_data').first();
    
    await expect(searchTool).toBeVisible();
    await expect(fetchTool).toBeVisible();
    console.log('✓ Both tools synced and visible');
    
    // Step 9: Verify MCP badge on tools
    console.log('Step 9: Checking MCP badges...');
    const mcpBadges = await page.locator('text=MCP:').count();
    expect(mcpBadges).toBeGreaterThanOrEqual(2);
    console.log('✓ MCP badges present on tools');
    
    // Take final screenshot
    await page.screenshot({ path: 'test-results/e2e-mcp-success.png', fullPage: true });
    
    console.log('\n🎉 E2E Test completed successfully!');
  });
  
  test('MCP import with invalid JSON shows error', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="text"]', USERNAME);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    
    await page.waitForURL(/dashboard|/);
    await page.click('text=MCP Servers');
    await page.click('text=Import JSON');
    
    // Fill invalid JSON
    await page.fill('textarea', 'not valid json {{');
    await page.click('button:has-text("Import")');
    
    // Should show error
    await page.waitForTimeout(1000);
    const pageContent = await page.content();
    expect(pageContent).toContain('Invalid JSON');
    
    console.log('✓ Invalid JSON properly rejected');
  });
});
