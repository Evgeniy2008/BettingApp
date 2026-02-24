// Support Chat Widget
// Use existing PHP_API_BASE if defined in app.js, otherwise use default
if (typeof PHP_API_BASE === 'undefined') {
  var PHP_API_BASE = window.location.origin.replace(/:\d+$/, '') + (window.location.port ? '' : '/api');
}

let chatHistory = [];
let isOperatorConnected = false;
let chatOpen = false;
let lastMessageId = 0; // Track last message ID for polling
let pollInterval = null;

const chatWidget = document.getElementById('support-chat-widget');
const chatToggle = document.getElementById('support-chat-toggle');
const chatWindow = document.getElementById('support-chat-window');
const chatMessages = document.getElementById('support-chat-messages');
const chatInput = document.getElementById('support-chat-input');
const chatSend = document.getElementById('support-chat-send');
const chatClose = document.getElementById('support-chat-close');
const chatStatus = document.getElementById('support-chat-status');
const connectOperatorBtn = document.getElementById('support-chat-connect-operator');
const chatBadge = document.getElementById('support-chat-badge');
const quickQuestions = document.getElementById('support-chat-quick-questions');
const quickAnswers = document.getElementById('support-chat-quick-answers');

// Predefined answers for quick questions
const quickQuestionAnswers = {
  'How do I withdraw money?': `To withdraw money from your account:

1. Go to the "Wallet" section
2. Click "Create Withdrawal Request"
3. Enter the withdrawal amount
4. Enter your cryptocurrency wallet address
5. Select the currency (USDT, BTC, or ETH)
6. Submit the request

Your request will be reviewed by an administrator. Once approved, the funds will be sent to your wallet address. Processing time is usually within 24 hours.`,

  'How do I deposit money?': `To deposit money into your account:

1. Go to the "Wallet" section
2. Copy the wallet address for your preferred cryptocurrency (USDT, BTC, or ETH)
3. Send the funds to the provided address
4. Click "I sent the deposit"
5. Enter the deposit amount and transaction hash
6. Submit your deposit request

Your deposit will be reviewed by an administrator. Once confirmed, the funds will be added to your balance.`,

  'How do I place a bet?': `To place a bet:

1. Browse available matches in the main section
2. Select a match you want to bet on
3. Choose your prediction (win, draw, or other available options)
4. Enter your bet amount
5. Confirm your bet

Your bet will be added to your bet slip. Make sure you have sufficient balance or available credit limit.`,

  'What is credit limit?': `Credit limit is the maximum amount you can bet even if your balance is zero or insufficient.

• Your credit limit is set by the administrator
• When you place bets, they are deducted from your credit limit if your balance is insufficient
• You can see your current credit limit and debt in the "Wallet" section
• To request a credit limit increase, contact support

Note: Credit limit is a convenience feature and should be used responsibly.`,

  'I have a problem with my deposit': `If you're experiencing issues with your deposit:

1. Check that you sent funds to the correct wallet address
2. Verify the transaction hash is correct
3. Ensure the amount matches what you sent
4. Check the status of your deposit in "Deposit History"

If your deposit is still pending after 24 hours or if you see any errors, please connect to an operator for assistance. They can help you resolve the issue.`,

  'I have a problem with my bet': `If you're experiencing issues with your bet:

1. Check your bet history to see the bet status
2. Verify that you have sufficient balance or credit limit
3. Make sure the match hasn't been cancelled or postponed

If your bet wasn't placed correctly, appears incorrectly, or you have questions about bet outcomes, please connect to an operator. They can review your bet and help resolve any issues.`,

  'I have a problem with withdrawal': `If you're experiencing issues with your withdrawal:

1. Check your withdrawal history to see the request status
2. Verify that you entered the correct wallet address
3. Ensure you have sufficient balance for withdrawal
4. Check that the withdrawal amount meets any minimum requirements

If your withdrawal is pending for more than 24 hours, was rejected, or you need to change the withdrawal details, please connect to an operator. They can review your request and assist you.`
};

// Quick answer buttons (predefined responses)
if (quickAnswers) {
  quickAnswers.addEventListener('click', (e) => {
    const btn = e.target.closest('.quick-answer-btn');
    if (btn && isOperatorConnected) {
      const answer = btn.getAttribute('data-answer');
      if (answer) {
        sendMessage(answer);
      }
    }
  });
}

// Track if a quick question is being processed to prevent double clicks
let isProcessingQuickQuestion = false;

// Quick question buttons (show predefined answers instead of sending to AI)
if (quickQuestions) {
  quickQuestions.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const btn = e.target.closest('.quick-question-btn');
    if (!btn || isOperatorConnected || isProcessingQuickQuestion) return;
    
    const question = btn.getAttribute('data-question');
    if (!question || !quickQuestionAnswers[question]) return;
    
    // Prevent double clicks
    isProcessingQuickQuestion = true;
    btn.disabled = true;
    
    try {
      // Show user's question immediately
      addMessage(question, true);
      chatHistory.push({ text: question, isUser: true });
      
      // Save user message to database (with skip_ai flag to prevent AI processing)
      try {
        await fetch(`${PHP_API_BASE}/chat.php`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({
            message: question,
            history: chatHistory,
            skip_ai: true // Flag to skip AI processing
          })
        });
      } catch (error) {
        console.error('Error saving quick question:', error);
      }
      
      // Show predefined answer after short delay
      setTimeout(async () => {
        const answer = quickQuestionAnswers[question];
        addMessage(answer, false, false);
        chatHistory.push({ text: answer, isUser: false });
        
        // Save predefined answer to database as AI response
        try {
          const response = await fetch(`${PHP_API_BASE}/chat.php`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
              message: answer,
              history: chatHistory,
              is_ai_response: true
            })
          });
          const data = await response.json();
          // Update lastMessageId if response includes message ID
          if (data.ok && data.message_id) {
            lastMessageId = data.message_id;
          }
        } catch (error) {
          console.error('Error saving quick answer:', error);
        }
        
        // Re-enable button after processing
        isProcessingQuickQuestion = false;
        btn.disabled = false;
      }, 300); // Small delay for better UX
    } catch (error) {
      console.error('Error processing quick question:', error);
      isProcessingQuickQuestion = false;
      btn.disabled = false;
    }
  });
}

// Toggle chat window
chatToggle?.addEventListener('click', () => {
  chatOpen = !chatOpen;
  if (chatOpen) {
    chatWindow.style.display = 'flex';
    loadChatHistory(true); // Force reload when opening
    if (isOperatorConnected) {
      chatInput.focus();
    }
    startPolling();
  } else {
    chatWindow.style.display = 'none';
    stopPolling();
  }
});

chatClose?.addEventListener('click', () => {
  chatOpen = false;
  chatWindow.style.display = 'none';
  stopPolling();
});

// Send message
function sendMessage(messageText = null, isQuickQuestion = false) {
  const message = messageText || chatInput.value.trim();
  if (!message) return;
  
  // Check if operator is connected before allowing user to type manually
  // Quick questions can be sent even without operator (for AI)
  if (!isOperatorConnected && !messageText && !isQuickQuestion) {
    // User trying to type manually - show message
    addMessage('Please connect to an operator first or use quick questions below.', false);
    return;
  }
  
  // Clear input if using input field
  if (!messageText) {
    chatInput.value = '';
  }
  
  // Add user message to UI immediately
  addMessage(message, true);
  
  // Send to API
  fetch(`${PHP_API_BASE}/chat.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({
      message: message,
      history: chatHistory
    })
  })
  .then(res => res.json())
  .then(data => {
    if (data.ok) {
      // Only add AI response if operator is not connected
      if (!data.operator_connected) {
        addMessage(data.response, false, false);
        chatHistory.push({ text: data.response, isUser: false });
      }
      
      // Update operator connection status
      const wasConnected = isOperatorConnected;
      isOperatorConnected = data.operator_connected || false;
      
      if (!wasConnected && isOperatorConnected) {
        addMessage('You are now connected with a support operator. They will respond shortly.', false, true);
        startPolling();
      }
      
      updateChatStatus();
      
      // Add to history
      chatHistory.push({ text: message, isUser: true });
    } else {
      addMessage('Error: ' + (data.error || 'Failed to send message'), false);
    }
  })
  .catch(error => {
    console.error('Chat error:', error);
    addMessage('Error sending message. Please try again.', false);
  });
}

chatSend?.addEventListener('click', () => sendMessage());
chatInput?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && isOperatorConnected) {
    sendMessage();
  }
});

// Connect to operator
connectOperatorBtn?.addEventListener('click', () => {
  fetch(`${PHP_API_BASE}/chat.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({
      message: 'User requested to connect with operator',
      action: 'connect_operator'
    })
  })
  .then(res => res.json())
  .then(data => {
    if (data.ok) {
      isOperatorConnected = true;
      updateChatStatus();
      addMessage('You are now connected with a support operator. They will respond shortly.', false, true);
      startPolling();
    } else {
      addMessage('Error: ' + (data.error || 'Failed to connect to operator'), false);
    }
  })
  .catch(error => {
    console.error('Connect operator error:', error);
    addMessage('Error connecting to operator. Please try again.', false);
  });
});

// Add message to UI
function addMessage(text, isUser, isOperator = false) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `support-chat-message ${isUser ? 'support-chat-message-user' : 'support-chat-message-bot'}`;
  
  const messageText = document.createElement('div');
  messageText.className = 'support-chat-message-text';
  messageText.textContent = text;
  
  messageDiv.appendChild(messageText);
  chatMessages.appendChild(messageDiv);
  
  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Load chat history (with smart update - only add new messages)
function loadChatHistory(forceReload = false) {
  fetch(`${PHP_API_BASE}/chat.php`, {
    method: 'GET',
    credentials: 'include'
  })
  .then(res => res.json())
  .then(data => {
    if (data.ok && data.messages) {
      const currentMessageCount = chatMessages.children.length;
      const hadMessages = currentMessageCount > 0;
      
      // If force reload or no messages, reload all
      if (forceReload || !hadMessages) {
        chatMessages.innerHTML = '';
        chatHistory = [];
        lastMessageId = 0;
        
        if (data.messages.length === 0) {
          // Show welcome message if no history
          addMessage('Hello! I\'m your AI assistant. How can I help you today? You can ask me about withdrawals, deposits, placing bets, or credit limits.', false);
          chatHistory.push({ text: 'Hello! I\'m your AI assistant. How can I help you today? You can ask me about withdrawals, deposits, placing bets, or credit limits.', isUser: false });
        } else {
          data.messages.forEach(msg => {
            const isUser = msg.is_from_user === 1 || msg.is_from_user === true;
            const isOperator = msg.is_operator_connected === 1 || msg.is_operator_connected === true;
            addMessage(msg.message, isUser, isOperator);
            
            chatHistory.push({
              text: msg.message,
              isUser: isUser
            });
            
            if (msg.id > lastMessageId) {
              lastMessageId = msg.id;
            }
          });
        }
      } else {
        // Smart update: only add new messages
        const newMessages = data.messages.filter(msg => msg.id > lastMessageId);
        newMessages.forEach(msg => {
          const isUser = msg.is_from_user === 1 || msg.is_from_user === true;
          const isOperator = msg.is_operator_connected === 1 || msg.is_operator_connected === true;
          addMessage(msg.message, isUser, isOperator);
          
          chatHistory.push({
            text: msg.message,
            isUser: isUser
          });
          
          if (msg.id > lastMessageId) {
            lastMessageId = msg.id;
          }
        });
      }
      
      // Check if operator is connected
      const lastMessage = data.messages[data.messages.length - 1];
      if (lastMessage) {
        const wasConnected = isOperatorConnected;
        isOperatorConnected = lastMessage.is_operator_connected === 1 || lastMessage.is_operator_connected === true;
        
        if (!wasConnected && isOperatorConnected) {
          updateChatStatus();
          startPolling();
        } else if (wasConnected !== isOperatorConnected) {
          updateChatStatus();
        }
      } else {
        isOperatorConnected = false;
        updateChatStatus();
      }
    }
  })
  .catch(error => {
    console.error('Load chat history error:', error);
  });
}

// Update chat status
function updateChatStatus() {
  if (isOperatorConnected) {
    chatStatus.textContent = 'Operator';
    chatStatus.className = 'support-chat-status support-chat-status-operator';
    connectOperatorBtn.style.display = 'none';
    if (quickQuestions) quickQuestions.style.display = 'none';
    if (quickAnswers) quickAnswers.style.display = 'flex';
    // Enable input when operator connected
    if (chatInput) {
      chatInput.disabled = false;
      chatInput.placeholder = 'Type your message...';
    }
    if (chatSend) chatSend.disabled = false;
  } else {
    chatStatus.textContent = 'AI Assistant';
    chatStatus.className = 'support-chat-status support-chat-status-ai';
    connectOperatorBtn.style.display = 'block';
    if (quickQuestions) quickQuestions.style.display = 'flex';
    if (quickAnswers) quickAnswers.style.display = 'none';
    // Disable input when operator not connected
    if (chatInput) {
      chatInput.disabled = true;
      chatInput.placeholder = 'Connect to operator to type...';
    }
    if (chatSend) chatSend.disabled = true;
  }
}

// Poll for new messages (always when chat is open)
function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  
  if (chatOpen) {
    pollInterval = setInterval(() => {
      loadChatHistory(false); // Smart update
    }, 2000); // Poll every 2 seconds for live updates
  }
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// Initial load
if (chatMessages) {
  // Will be loaded when chat opens
}
