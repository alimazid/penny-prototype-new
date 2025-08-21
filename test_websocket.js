// Simple Socket.IO client test
const { io } = require('socket.io-client');

console.log('🧪 Testing Socket.IO connection...');

const socket = io('http://localhost:3000', {
  transports: ['websocket', 'polling']
});

socket.on('connect', () => {
  console.log('✅ Socket.IO connected successfully!');
  console.log('🆔 Socket ID:', socket.id);
  
  // Subscribe to email updates
  socket.emit('subscribe_email_updates');
  console.log('📧 Subscribed to email updates');
});

socket.on('connected', (data) => {
  console.log('📡 Server connection confirmed:', data);
});

socket.on('email_update', (data) => {
  console.log('📧 Email update received:', data);
});

socket.on('disconnect', () => {
  console.log('❌ Socket.IO disconnected');
});

socket.on('connect_error', (error) => {
  console.error('🚨 Socket.IO connection error:', error.message);
});

// Keep the test running for 10 seconds
setTimeout(() => {
  console.log('🏁 Test completed');
  socket.disconnect();
  process.exit(0);
}, 10000);