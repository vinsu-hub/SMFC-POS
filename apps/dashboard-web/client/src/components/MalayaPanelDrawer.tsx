import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { MessageSquare, Send, Loader2, Sparkles } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export function MalayaPanelDrawer() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hi! I\'m Malaya, your AI operations assistant. I can help you analyze trends, compare branches, forecast demand, and answer operational questions. What would you like to know?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;

    // Add user message
    const userMessage: Message = {
      id: Math.random().toString(36).substr(2, 9),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    // Simulate AI response
    setTimeout(() => {
      const responses = [
        'Based on the data, Danielito\'s had a 12% higher margin than Malaya\'s this week, primarily due to lower ingredient waste.',
        'I\'d recommend focusing on the duck breast inventory at D\' Bar - it\'s been moving 30% faster than forecast.',
        'The loss log shows spoilage is your biggest cost driver. Implementing better rotation could save ~$200/week.',
        'Comparing this week to last week: Revenue is up 8%, but COGS increased by 15%. We should review supplier pricing.',
        'Staff attendance at Malaya\'s has improved by 5% since the new scheduling system. Great work!',
      ];

      const response: Message = {
        id: Math.random().toString(36).substr(2, 9),
        role: 'assistant',
        content: responses[Math.floor(Math.random() * responses.length)],
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, response]);
      setLoading(false);
    }, 1000);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-6 right-6 rounded-full w-14 h-14 shadow-lg hover:shadow-xl transition-shadow bg-gradient-to-br from-[#6E8368] to-[#5A6F56] text-white border-0 hover:from-[#5A6F56] hover:to-[#4A5F46]"
          title="Malaya AI Assistant"
        >
          <Sparkles className="w-6 h-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:w-96 p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6E8368] to-[#5A6F56] flex items-center justify-center text-white text-sm font-bold">
              M
            </div>
            <div>
              <SheetTitle className="font-corp-display">Malaya AI</SheetTitle>
              <p className="text-xs text-gray-500 font-corp-body">Operations Assistant</p>
            </div>
          </div>
        </SheetHeader>

        {/* Messages Area */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs px-4 py-2 rounded-lg ${
                    message.role === 'user'
                      ? 'bg-[#1B2A4A] text-white rounded-br-none'
                      : 'bg-gray-100 text-gray-900 rounded-bl-none'
                  } font-corp-body text-sm`}
                >
                  {message.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-900 px-4 py-2 rounded-lg rounded-bl-none flex items-center gap-2 font-corp-body text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Thinking...
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="p-4 border-t space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setInput('Compare this week to last week')}
              className="text-xs font-corp-body h-8"
            >
              Compare weeks
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setInput('What\'s our biggest cost driver?')}
              className="text-xs font-corp-body h-8"
            >
              Cost analysis
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setInput('Forecast demand for next week')}
              className="text-xs font-corp-body h-8"
            >
              Forecast
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setInput('Show branch comparison')}
              className="text-xs font-corp-body h-8"
            >
              Branch compare
            </Button>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Ask Malaya..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              disabled={loading}
              className="font-corp-body text-sm"
            />
            <Button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              size="icon"
              className="bg-[#1B2A4A] hover:bg-[#13203A]"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
