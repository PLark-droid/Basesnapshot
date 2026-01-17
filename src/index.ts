/**
 * LarkBaseSnapshot - Entry Point
 *
 * @description Creates static snapshots of Lark Base,
 * converting dynamic fields (lookup, relations) to static text/number values
 *
 * Powered by Miyabi - Autonomous AI Development Framework
 */

import { SnapshotService } from './services/index.js';
import type { SnapshotConfig, SnapshotResult, LarkConfig } from './types/index.js';

// Re-export types and services for library usage
export * from './types/index.js';
export * from './services/index.js';

/**
 * Create a snapshot of a Lark Base
 *
 * @param larkConfig - Lark API configuration
 * @param snapshotConfig - Snapshot configuration
 * @returns Snapshot result
 */
export async function createSnapshot(
  larkConfig: LarkConfig,
  snapshotConfig: SnapshotConfig
): Promise<SnapshotResult> {
  const service = new SnapshotService(larkConfig);
  return service.createSnapshot(snapshotConfig);
}

/**
 * CLI entry point
 */
export async function main(): Promise<void> {
  console.log('📸 LarkBaseSnapshot');
  console.log('Create static snapshots of Lark Base\n');

  // Check for required environment variables
  const appId = process.env.LARK_APP_ID;
  const appSecret = process.env.LARK_APP_SECRET;
  const sourceUrl = process.env.SOURCE_BASE_URL || process.argv[2];
  const targetName = process.env.TARGET_BASE_NAME || process.argv[3];

  if (!appId || !appSecret) {
    console.error('❌ Error: Missing Lark credentials');
    console.error('');
    console.error('Please set the following environment variables:');
    console.error('  LARK_APP_ID      - Your Lark App ID');
    console.error('  LARK_APP_SECRET  - Your Lark App Secret');
    console.error('');
    console.error('Or create a .env file:');
    console.error('  LARK_APP_ID=your_app_id');
    console.error('  LARK_APP_SECRET=your_app_secret');
    process.exit(1);
  }

  if (!sourceUrl) {
    console.error('❌ Error: Missing source Base URL');
    console.error('');
    console.error('Usage:');
    console.error('  npx tsx src/index.ts <source_base_url> <target_base_name>');
    console.error('');
    console.error('Or set environment variables:');
    console.error('  SOURCE_BASE_URL  - URL of the source Lark Base');
    console.error('  TARGET_BASE_NAME - Name for the snapshot Base');
    process.exit(1);
  }

  const snapshotConfig: SnapshotConfig = {
    sourceBaseUrl: sourceUrl,
    targetBaseName: targetName || `Snapshot_${new Date().toISOString().split('T')[0]}`,
    grantAdminPermission: true,
  };

  console.log('Configuration:');
  console.log(`  Source: ${snapshotConfig.sourceBaseUrl}`);
  console.log(`  Target: ${snapshotConfig.targetBaseName}`);
  console.log(`  Admin Permission: ${snapshotConfig.grantAdminPermission}`);
  console.log('');
  console.log('Creating snapshot...\n');

  try {
    const result = await createSnapshot(
      { appId, appSecret },
      snapshotConfig
    );

    if (result.success) {
      console.log('✅ Snapshot created successfully!\n');
      console.log('Results:');
      console.log(`  Source Base: ${result.sourceBase.name}`);
      console.log(`  Target Base: ${result.targetBase.name}`);
      console.log(`  Tables Processed: ${result.tablesProcessed}`);
      console.log(`  Records Processed: ${result.recordsProcessed}`);
      console.log(`  Fields Converted: ${result.fieldsConverted}`);
      console.log(`  Created At: ${result.createdAt}`);

      if (result.targetBase.url) {
        console.log(`\n🔗 Open snapshot: ${result.targetBase.url}`);
      }
    } else {
      console.error('❌ Snapshot creation failed\n');
      console.error('Errors:');
      for (const error of result.errors) {
        const location = [error.table, error.record, error.field]
          .filter(Boolean)
          .join(' > ');
        console.error(`  - ${location ? `[${location}] ` : ''}${error.message}`);
      }
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Unexpected error:', (error as Error).message);
    process.exit(1);
  }
}

// Run main if this is the entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
}
