# Tommy's Quests - React Mockup Source Code

Below is the complete, single-file React component representing the "Brawl Stars" styled mockup for Tommy's Quests. It includes the gamified UI, navigation, mock state, and interactive components.

```jsx
import React, { useState, useEffect } from 'react';
import { 
  Gamepad2, Store, BarChart3, Zap, Star, Trophy, 
  Map as MapIcon, BookOpen, Calculator, MessageCircle,
  Coins, Lock, Check, X, Skull, Award, Flag
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('events');
  const [coins, setCoins] = useState(2500);
  const [toast, setToast] = useState(null);
  const [activeMission, setActiveMission] = useState(null);
  const [xp, setXp] = useState(78);

  // Auto-hide toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  const handleBuy = (cost, itemName) => {
    if (coins >= cost) {
      setCoins(prev => prev - cost);
      showToast(`EPIC UNLOCK! ${itemName} is yours!`, 'success');
    } else {
      showToast(`NOT ENOUGH COINS! Need ${cost - coins} more.`, 'error');
    }
  };

  return (
    // Dynamic game-lobby background with a subtle radial pattern
    <div className="flex h-screen w-full bg-blue-600 text-slate-800 font-sans overflow-hidden selection:bg-yellow-400 selection:text-black"
         style={{ backgroundImage: 'radial-gradient(circle at center, #2563eb 0%, #1e40af 100%)' }}>
      
      {/* SIDEBAR NAVIGATION - Gamified */}
      <aside className="w-24 md:w-64 bg-blue-900 border-r-4 border-blue-950 flex flex-col relative z-20 shadow-2xl">
        <div className="p-4 md:p-6 border-b-4 border-blue-950 flex flex-col items-center md:items-start">
          <div className="bg-yellow-400 p-2 md:p-3 rounded-2xl border-b-4 border-yellow-600 shadow-lg mb-2 transform -rotate-3">
            <Zap className="text-yellow-950 h-8 w-8 md:h-10 md:w-10 fill-current"/>
          </div>
          <h1 className="hidden md:block text-2xl font-black text-white italic tracking-wider drop-shadow-md">
            TOMMY'S<br/><span className="text-yellow-400">QUESTS</span>
          </h1>
        </div>

        <nav className="flex-1 p-2 md:p-4 space-y-3 mt-4">
          <NavItem className="md:mr-3" icon="{<Gamepad2" size="{28}"/>} 
            label="Events" 
            isActive={activeTab === 'events'} 
            onClick={() => setActiveTab('events')}
            color="bg-green-500"
          />
          <NavItem className="md:mr-3" icon="{<Store" size="{28}"/>} 
            label="Shop" 
            isActive={activeTab === 'rewards'} 
            onClick={() => setActiveTab('rewards')}
            color="bg-purple-500"
          />
        </nav>

        {/* Parent / Admin Tab */}
        <div className="p-2 md:p-4 border-t-4 border-blue-950 bg-blue-800/50">
           <button 
            onClick={() => setActiveTab('admin')}
            className={`flex items-center justify-center md:justify-start w-full p-3 rounded-xl transition-all duration-200 font-black uppercase tracking-wider
              ${activeTab === 'admin' 
                ? 'bg-slate-700 text-white border-b-4 border-slate-900 scale-95' 
                : 'bg-blue-900 text-blue-300 hover:bg-slate-700 hover:text-white border-b-4 border-transparent hover:border-slate-900'}`}
          >
            <BarChart3 className="md:mr-3" size="{24}"/>
            <span className="hidden md:inline">Coach Stats</span>
            <Lock className="hidden md:block ml-auto opacity-50" size="{16}"/>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        
        {/* TOP HEADER - Player Profile Style */}
        <header className="h-24 bg-blue-800/80 backdrop-blur-md border-b-4 border-blue-900 flex items-center justify-between px-4 md:px-8 z-10 shadow-md">
          
          {/* Player Info */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-slate-200 rounded-2xl border-4 border-slate-300 flex items-center justify-center shadow-lg relative overflow-hidden">
              <Star className="text-slate-400 w-8 h-8 fill-current"/>
              <div className="absolute bottom-0 w-full h-1/2 bg-slate-300/50"></div>
            </div>
            <div className="flex flex-col">
              <span className="text-xl md:text-2xl text-white font-black drop-shadow-md tracking-wide">TOMMY</span>
              
              {/* XP Bar */}
              <div className="flex items-center gap-2 mt-1 w-32 md:w-48">
                <span className="text-xs font-black text-blue-300">LVL 9</span>
                <div className="flex-1 h-4 bg-blue-950 rounded-full border-2 border-blue-900 overflow-hidden relative">
                  <div 
                    className="absolute top-0 left-0 h-full bg-gradient-to-r from-yellow-400 to-orange-500 transition-all duration-1000"
                    style={{ width: `${xp}%` }}
                  ></div>
                  {/* Glossy overlay */}
                  <div className="absolute top-0 left-0 w-full h-1/2 bg-white/20"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Currency */}
          <div className="flex items-center bg-blue-950 border-4 border-blue-900 rounded-2xl px-4 py-2 md:px-6 md:py-3 shadow-inner transform rotate-1">
            <div className="bg-yellow-400 p-1.5 rounded-full mr-2 md:mr-3 border-2 border-yellow-600 shadow-sm">
              <Coins className="text-yellow-900 fill-yellow-200" size="{20}"/>
            </div>
            <span className="text-xl md:text-3xl text-yellow-400 font-black tracking-wide drop-shadow-sm">
              {coins.toLocaleString()}
            </span>
          </div>
        </header>

        {/* SCROLLABLE VIEW AREA */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 relative">
          <div className="relative z-10 max-w-5xl mx-auto pb-20">
            {activeTab === 'events' && <EventBoard onOpenMission="{setActiveMission}"/>}
            {activeTab === 'rewards' && <TheShop coins="{coins}" onBuy="{handleBuy}"/>}
            {activeTab === 'admin' && <CoachCorner/>}
          </div>
        </div>
      </main>

      {/* MISSION MODAL - "Brawl" Style */}
      {activeMission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-blue-950/90 backdrop-blur-sm p-4">
          <div className="animate-in zoom-in-95 duration-200 bg-white rounded-3xl border-8 border-slate-800 shadow-[0_20px_50px_rgba(0,0,0,0.5)] w-full max-w-xl overflow-hidden flex flex-col relative">
            
            {/* Modal Header */}
            <div className={`p-6 text-center relative border-b-8 border-black/10 ${activeMission.headerColor}`}>
              <button 
                onClick={() => setActiveMission(null)}
                className="absolute top-4 right-4 w-10 h-10 bg-black/20 hover:bg-black/30 text-white rounded-full flex items-center justify-center transition-colors"
              >
                <X size="{24}" strokeWidth="{3}"/>
              </button>
              
              <div className="w-24 h-24 mx-auto bg-white rounded-2xl border-4 border-slate-200 flex items-center justify-center mb-2 shadow-lg transform rotate-3">
                {activeMission.icon}
              </div>
              <h2 className="text-3xl font-black text-white uppercase tracking-wide drop-shadow-md italic mt-2">
                {activeMission.title}
              </h2>
            </div>

            {/* Modal Body */}
            <div className="p-8 flex flex-col items-center text-center bg-slate-50">
              <div className="inline-block px-4 py-1 bg-slate-200 rounded-full font-bold text-slate-500 uppercase tracking-wider text-sm mb-4">
                {activeMission.type}
              </div>
              
              <p className="text-lg font-bold text-slate-700 mb-8 max-w-md leading-relaxed">
                {activeMission.description}
              </p>
              
              <div className="bg-white border-4 border-slate-200 p-6 rounded-2xl w-full mb-8 shadow-inner relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-slate-100"></div>
                <p className="font-black text-2xl text-slate-800">{activeMission.preview}</p>
              </div>

              <button 
                onClick={() => {
                  setXp(prev => Math.min(100, prev + 10));
                  setActiveMission(null);
                  showToast('MATCH STARTED! Go get em!', 'success');
                }}
                className="w-full bg-green-500 hover:bg-green-400 text-white text-2xl font-black italic uppercase py-4 rounded-2xl border-b-8 border-green-700 active:border-b-0 active:translate-y-2 transition-all shadow-lg"
              >
                PLAY!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-10 fade-in duration-300">
          <div className={`flex items-center gap-3 px-6 py-4 rounded-2xl border-4 shadow-2xl font-black uppercase tracking-wide ${
            toast.type === 'success' 
              ? 'bg-green-500 border-green-700 text-white' 
              : 'bg-red-500 border-red-700 text-white'
          }`}>
            {toast.type === 'success' ? <Trophy className="fill-current" size="{24}"/> : <Skull size="{24}"/>}
            <span className="text-lg md:text-xl drop-shadow-sm">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// --- SUB-COMPONENTS ---

function NavItem({ icon, label, isActive, onClick, color }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center justify-center md:justify-start w-full p-2 md:p-3 rounded-2xl transition-all duration-200 font-black uppercase tracking-wider
        ${isActive 
          ? `${color} text-white border-b-4 border-black/20 scale-95 shadow-inner` 
          : 'bg-blue-800 text-blue-200 hover:bg-blue-700 hover:text-white border-b-4 border-blue-900 hover:translate-y-1'}`}
    >
      {icon}
      <span className="hidden md:inline text-lg">{label}</span>
    </button>
  );
}

function EventBoard({ onOpenMission }) {
  const events = [
    {
      id: 'math',
      title: 'Vault Heist',
      type: 'Math Madness',
      description: 'Crack the safe by solving the equations before the timer runs out!',
      preview: 'SOLVE: 45 ÷ 9 = ?',
      icon: <Calculator className="text-red-500 w-12 h-12"/>,
      color: 'bg-red-500',
      borderColor: 'border-red-700',
      headerColor: 'bg-gradient-to-br from-red-400 to-red-600'
    },
    {
      id: 'english',
      title: 'Alien Decode',
      type: 'English Comm',
      description: 'Translate the incoming alien transmissions to win!',
      preview: 'SPELL: C _ T -> R _ D',
      icon: <MessageCircle className="text-cyan-500 w-12 h-12"/>,
      color: 'bg-cyan-500',
      borderColor: 'border-cyan-700',
      headerColor: 'bg-gradient-to-br from-cyan-400 to-cyan-600'
    },
    {
      id: 'hebrew',
      title: 'Ancient Scroll',
      type: 'Hebrew Heroes',
      description: 'Find the hidden action words in the ancient text.',
      preview: 'משימה: זיהוי פעלים במשפט',
      icon: <BookOpen className="text-purple-500 w-12 h-12"/>,
      color: 'bg-purple-500',
      borderColor: 'border-purple-700',
      headerColor: 'bg-gradient-to-br from-purple-400 to-purple-600'
    },
    {
      id: 'moledet',
      title: 'Map Maker',
      type: 'Geography',
      description: 'Navigate the grid and claim the territory coordinates!',
      preview: 'FIND: 31°46′N 35°14′E',
      icon: <MapIcon className="text-green-500 w-12 h-12"/>,
      color: 'bg-green-500',
      borderColor: 'border-green-700',
      headerColor: 'bg-gradient-to-br from-green-400 to-green-600'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-blue-900/50 p-4 rounded-2xl border-4 border-blue-900 backdrop-blur-sm">
        <h2 className="text-2xl md:text-3xl font-black text-white italic tracking-wide uppercase drop-shadow-md">Daily Events</h2>
        <div className="flex gap-2">
          <div className="px-3 py-1.5 bg-green-500 text-white rounded-xl border-b-4 border-green-700 font-bold text-sm uppercase flex items-center gap-1">
            <Check size="{16}" strokeWidth="{3}"/> New Events
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
        {events.map(event => (
          <div 
            key={event.id}
            onClick={() => onOpenMission(event)}
            className={`group relative ${event.color} rounded-3xl border-b-8 ${event.borderColor} cursor-pointer hover:-translate-y-2 active:translate-y-2 active:border-b-0 transition-all duration-200 shadow-xl`}
          >
            {/* White inner card */}
            <div className="bg-white m-1.5 rounded-[1.25rem] h-[calc(100%-12px)] flex flex-col overflow-hidden relative">
              
              {/* Event Header Strip */}
              <div className={`${event.headerColor} p-2 text-center border-b-4 border-black/10`}>
                <span className="text-white font-black uppercase text-sm tracking-wider drop-shadow-sm">
                  {event.type}
                </span>
              </div>

              <div className="p-6 flex items-start gap-4 flex-1">
                <div className={`p-3 rounded-2xl bg-slate-100 border-4 ${event.borderColor} shadow-inner transform -rotate-3 group-hover:rotate-0 transition-transform`}>
                  {event.icon}
                </div>
                
                <div className="flex-1">
                  <h3 className="text-2xl font-black text-slate-800 uppercase italic leading-tight mb-2">
                    {event.title}
                  </h3>
                  <div className="bg-slate-100 p-2 rounded-xl border-2 border-slate-200">
                    <p className="font-bold text-slate-600 text-sm truncate">{event.preview}</p>
                  </div>
                </div>
              </div>

              {/* Reward pill */}
              <div className="absolute bottom-4 right-4 bg-yellow-400 px-3 py-1 rounded-full border-2 border-yellow-600 flex items-center gap-1 shadow-md">
                <Coins className="text-yellow-900 fill-current" size="{14}"/>
                <span className="font-black text-yellow-900 text-sm">+50</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TheShop({ coins, onBuy }) {
  const items = [
    {
      id: 1,
      title: 'Extra Serve!',
      type: 'Padel Perk',
      desc: 'Use this in the next family match for a free redo!',
      cost: 500,
      icon: <Award className="text-blue-500 w-16 h-16"/>,
      rarity: 'RARE',
      bgColor: 'bg-blue-500',
      borderColor: 'border-blue-700'
    },
    {
      id: 2,
      title: 'Trail Boss',
      type: 'Weekend Hike',
      desc: 'You choose exactly where we go hiking this Saturday.',
      cost: 1200,
      icon: <Flag className="text-purple-500 w-16 h-16"/>,
      rarity: 'EPIC',
      bgColor: 'bg-purple-500',
      borderColor: 'border-purple-700'
    },
    {
      id: 3,
      title: 'Lego Set',
      type: 'Hardware',
      desc: 'Pick out a brand new Lego set on our next trip to the store!',
      cost: 5000,
      icon: <Zap className="text-yellow-500 w-16 h-16 fill-current"/>,
      rarity: 'LEGENDARY',
      bgColor: 'bg-yellow-400',
      borderColor: 'border-yellow-600'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-blue-900/50 p-4 rounded-2xl border-4 border-blue-900 backdrop-blur-sm">
        <h2 className="text-2xl md:text-3xl font-black text-white italic tracking-wide uppercase drop-shadow-md">The Shop</h2>
        <div className="hidden md:flex items-center gap-2 bg-black/20 px-4 py-2 rounded-xl">
          <span className="text-blue-200 font-bold uppercase text-sm">Your Coins:</span>
          <span className="text-yellow-400 font-black text-xl">{coins.toLocaleString()}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {items.map(item => {
          const canAfford = coins >= item.cost;
          return (
            <div key={item.id} className="relative bg-white rounded-3xl border-8 border-slate-200 overflow-hidden shadow-xl flex flex-col group">
              
              {!canAfford && (
                <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] z-20 flex items-center justify-center rounded-[1.25rem]">
                  <div className="bg-red-500 px-4 py-2 rounded-xl border-b-4 border-red-700 transform rotate-12 flex items-center gap-2 shadow-xl">
                    <Lock className="text-white" size="{20}" strokeWidth="{3}"/>
                    <span className="font-black text-white uppercase text-lg">Locked</span>
                  </div>
                </div>
              )}

              {/* Rarity Header */}
              <div className={`${item.bgColor} p-2 text-center border-b-4 border-black/10`}>
                <span className="text-white font-black uppercase text-sm tracking-widest drop-shadow-md">
                  {item.rarity}
                </span>
              </div>

              <div className="p-6 flex flex-col items-center text-center flex-1 relative bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-50 to-slate-200">
                
                {/* Sunburst effect behind icon */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-white rounded-full blur-2xl opacity-60"></div>
                
                <div className="relative z-10 w-24 h-24 bg-white rounded-2xl border-4 border-slate-200 flex items-center justify-center mb-4 shadow-lg transform group-hover:scale-110 transition-transform duration-300">
                  {item.icon}
                </div>
                
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{item.type}</span>
                <h3 className="text-2xl font-black text-slate-800 uppercase italic leading-tight mb-3">{item.title}</h3>
                <p className="text-slate-600 font-semibold text-sm leading-snug">{item.desc}</p>
              </div>
              
              <div className="p-4 bg-slate-100 border-t-4 border-slate-200 mt-auto">
                <button
                  onClick={() => onBuy(item.cost, item.title)}
                  disabled={!canAfford}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl uppercase tracking-wider font-black text-xl transition-all
                    ${canAfford 
                      ? 'bg-yellow-400 text-yellow-950 border-b-4 border-yellow-600 hover:bg-yellow-300 active:border-b-0 active:translate-y-1 shadow-md' 
                      : 'bg-slate-300 text-slate-500 border-b-4 border-slate-400 cursor-not-allowed'
                    }`}
                >
                  <Coins 'fill-slate-400'} 'fill-yellow-200' : ? className="{canAfford" size="{24}"/>
                  {item.cost.toLocaleString()}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CoachCorner() {
  const logs = [
    { id: 1, time: '14:32', subject: 'Math Mayhem', status: 'LOSS', action: '-5 Trophies', isError: true },
    { id: 2, time: '14:28', subject: 'English Decode', status: 'WIN', action: '+150 Coins', isError: false },
    { id: 3, time: '13:15', subject: 'Hebrew Heroes', status: 'WIN', action: '+200 Coins', isError: false },
    { id: 4, time: '11:02', subject: 'Map Maker', status: 'DRAW', action: 'Time Out', isError: true },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center bg-slate-800 p-4 rounded-2xl border-4 border-slate-900 shadow-xl">
        <h2 className="text-2xl md:text-3xl font-black text-white uppercase drop-shadow-md flex items-center gap-3">
          <BarChart3 className="text-blue-400" size="{32}"/>
          Coach Stats
        </h2>
      </div>

      {/* METRICS WIDGETS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border-4 border-slate-200 p-6 rounded-3xl shadow-lg flex flex-col">
          <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-2">Win Rate</p>
          <div className="flex items-end justify-between mt-auto">
            <p className="text-4xl text-slate-800 font-black italic">84%</p>
            <div className="w-12 h-12 rounded-full border-8 border-slate-100 border-t-green-500 border-r-green-500 transform rotate-45"></div>
          </div>
        </div>
        
        <div className="bg-white border-4 border-slate-200 p-6 rounded-3xl shadow-lg flex flex-col">
          <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-2">Avg Time</p>
          <div className="flex items-end justify-between mt-auto">
            <p className="text-4xl text-slate-800 font-black italic">12s</p>
            <Zap className="text-yellow-400 fill-yellow-200 h-10 w-10"/>
          </div>
        </div>

        <div className="bg-white border-4 border-slate-200 p-6 rounded-3xl shadow-lg flex flex-col">
          <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-2">Total Wins</p>
          <div className="flex items-end justify-between mt-auto">
            <p className="text-4xl text-slate-800 font-black italic">14</p>
            <Trophy className="text-blue-500 fill-blue-200 h-10 w-10"/>
          </div>
        </div>
      </div>

      {/* EVENT LOG TABLE */}
      <div className="bg-white border-4 border-slate-200 rounded-3xl overflow-hidden shadow-lg mt-6">
        <div className="bg-slate-100 px-6 py-4 border-b-4 border-slate-200">
          <h3 className="text-lg font-black text-slate-600 uppercase tracking-wide">Battle Log</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider border-b-2 border-slate-200">Time</th>
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider border-b-2 border-slate-200">Event</th>
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider border-b-2 border-slate-200">Result</th>
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider border-b-2 border-slate-200">Reward/Penalty</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-slate-100 font-bold">
              {logs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-slate-500">{log.time}</td>
                  <td className="px-6 py-4 text-slate-800 uppercase italic">{log.subject}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-lg text-sm font-black uppercase ${
                      log.status === 'LOSS' ? 'bg-red-100 text-red-600 border-2 border-red-200' :
                      log.status === 'DRAW' ? 'bg-slate-200 text-slate-600 border-2 border-slate-300' :
                      'bg-green-100 text-green-600 border-2 border-green-200'
                    }`}>
                      {log.status}
                    </span>
                  </td>
                  <td className={`px-6 py-4 font-black ${log.isError ? 'text-red-500' : 'text-green-500'}`}>
                    {log.action}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}