import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, ChevronRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export function MalayaPanel() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'assistant',
      content: 'Hello! I\'m Malaya, your AI analyst. I can help you understand trends, compare performance, and answer questions about your business. What would you like to know?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const suggestedPrompts = [
    'Compare this week to last week',
    'Which product is trending up?',
    'Show me loss patterns',
    'Analyze staff efficiency',
  ];

  const handleSendMessage = async (text: string = input) => {
    if (!text.trim()) return;

    // Add user message
    const userMessage: Message = {
      id: Math.random().toString(),
      type: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    // Simulate AI response
    setTimeout(() => {
      const responses: Record<string, string> = {
        'compare this week to last week':
          'This week shows a 12% increase in revenue compared to last week. D\' Bar is leading with $5,120.75 (+15%), while Malaya\'s Cafe is steady at $3,850.25 (+8%). Danielito\'s is up 10% to $4,250.50.',
        'which product is trending up?':
          'Cocktails are trending up 34% into the holiday season. I recommend pushing these items in promotions. Duck Confit is also rising (+18%), while traditional appetizers are declining (-5%).',
        'show me loss patterns':
          'Your losses total $400.50 today. D\' Bar has the highest losses ($180) due to breakage. I recommend reviewing handling procedures. Spoilage accounts for 45% of losses across all venues.',
        'analyze staff efficiency':
          'Overall staff efficiency is strong. Malaya\'s Cafe has the best efficiency ratio at 67.5% margin. Average shift completion is 7.9 hours. One staff member at Danielito\'s was 15 minutes late.',
      };

      const response =
        responses[text.toLowerCase()] ||
        'I\'ve analyzed your data. Based on current trends, I recommend focusing on high-margin items and reviewing loss prevention procedures. Would you like more details on any specific area?';

      const assistantMessage: Message = {
        id: Math.random().toString(),
        type: 'assistant',
        content: response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setLoading(false);
    }, 800);
  };

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6E8368] to-[#D9A441] flex items-center justify-center text-white">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-corp-display font-semibold text-gray-900">Malaya AI</h3>
            <p className="text-xs text-gray-500">Your business analyst</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xs px-4 py-2 rounded-lg ${
                  message.type === 'user'
                    ? 'bg-[#1B2A4A] text-white'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                <p className="text-sm font-corp-body">{message.content}</p>
                <p
                  className={`text-xs mt-1 ${
                    message.type === 'user' ? 'text-gray-300' : 'text-gray-500'
                  }`}
                >
                  {message.timestamp.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 px-4 py-2 rounded-lg">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Suggested Prompts (when no messages or idle) */}
      {messages.length <= 1 && !loading && (
        <div className="px-4 py-3 border-t border-gray-200 space-y-2">
          <p className="text-xs text-gray-600 font-corp-body">Try asking:</p>
          <div className="space-y-2">
            {suggestedPrompts.map((prompt) => (
              <Button
                key={prompt}
                variant="outline"
                size="sm"
                className="w-full justify-start text-xs h-auto py-2 px-3 text-left"
                onClick={() => handleSendMessage(prompt)}
              >
                <ChevronRight className="w-3 h-3 mr-2 flex-shrink-0" />
                {prompt}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex gap-2">
          <Input
            placeholder="Ask Malaya..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !loading) {
                handleSendMessage();
              }
            }}
            disabled={loading}
            className="font-corp-body text-sm"
          />
          <Button
            onClick={() => handleSendMessage()}
            disabled={loading || !input.trim()}
            size="sm"
            className="bg-[#1B2A4A] hover:bg-[#13203A]"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
