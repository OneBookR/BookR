// test-mode.js - Säker testning med begränsningar
let testReads = 0;
const MAX_TEST_READS = 100; // Bara 100 reads för testning

export function safeTestRead(operation) {
  testReads++;
  
  if (testReads > MAX_TEST_READS) {
    throw new Error(`🛑 Test limit reached: ${testReads}/${MAX_TEST_READS} reads. Stop testing!`);
  }
  
  console.log(`🧪 Test read ${testReads}/${MAX_TEST_READS}: ${operation}`);
  
  if (testReads % 10 === 0) {
    console.warn(`⚠️ Test progress: ${testReads}/${MAX_TEST_READS} reads used`);
  }
}

export function resetTestCounter() {
  testReads = 0;
  console.log('🔄 Test counter reset');
}