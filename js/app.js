
    // ==========================================
    // VERCEL / SUPABASE API BRIDGE
    // ==========================================
    async function apiRequest(action, payload = {}) {
      const response = await fetch(`/api/index?action=${encodeURIComponent(action)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });
      let data = null;
      try { data = await response.json(); } catch (_) {}
      if (!response.ok) {
        throw new Error((data && data.error) || `API request failed (${response.status})`);
      }
      return data;
    }

    // Global State Management Objects
    let globalAllocations = { limits: {}, spent: {} };
    let globalLedgerDataBackup = [];
    let currentLedgerFilter = "All";
    let cachedMembersList = []; 
    
    // Splash screen configuration data
    const journeySequence = [
      { text: "Assembling the squad...", icon: "users" },
      { text: "Packing gear...", icon: "backpack" },
      { text: "Taking the train...", icon: "train-front" },
      { text: "Boarding the bus...", icon: "bus-front" },
      { text: "Taking a taxi...", icon: "car-taxi-front" },
      { text: "Mapping routes...", icon: "map-pinned" },
      { text: "Reached the Destination", icon: "mountain-snow" }
    ];

    // Splash animation tracking variables
    let splashStep = 0;
    let useIconA = true;
    let splashSequenceInterval = null;
    let isSplashFinished = false; 
    let pendingSplashHide = false; 

    // Initializes the circular compass splash animation loop
    function runSplashSequence() {
      splashStep = 0;
      isSplashFinished = false;
      pendingSplashHide = false;
      useIconA = true;
      
      // Resets the circular path fill
      const progressRing = document.getElementById('splash-progress-ring');
      if (progressRing) {
        progressRing.style.strokeDashoffset = '289'; // 289 is roughly the circumference
      }

      if(splashSequenceInterval) clearInterval(splashSequenceInterval);
      
      doSplashStep(); 
      splashSequenceInterval = setInterval(doSplashStep, 300); // Progresses frame every 300ms
    }

    // Handles the actual frame transition in the splash screen
    function doSplashStep() {
      if (splashStep >= journeySequence.length) {
        clearInterval(splashSequenceInterval);
        isSplashFinished = true;
        // If data loaded before animation finished, hide it now
        if (pendingSplashHide) hideSplashScreenNow(); 
        return;
      }

      const iconA = document.getElementById('splash-icon-a');
      const iconB = document.getElementById('splash-icon-b');
      const textEl = document.getElementById('splash-micro-text');
      const progressRing = document.getElementById('splash-progress-ring');
      const currentStepData = journeySequence[splashStep];

      // Quick text dip/replace animation
      textEl.classList.add('text-hidden');
      setTimeout(() => {
        textEl.innerText = currentStepData.text;
        textEl.classList.remove('text-hidden');
      }, 80);

      // Icon Morphing logic (swaps between two element layers)
      const activeIcon = useIconA ? iconB : iconA;
      const fadingIcon = useIconA ? iconA : iconB;
      
      activeIcon.setAttribute('data-lucide', currentStepData.icon);
      lucide.createIcons({ root: document.getElementById('splash-icon-container') });
      
      fadingIcon.classList.replace('morph-in', 'morph-out');
      activeIcon.classList.replace('morph-out', 'morph-in');
      
      useIconA = !useIconA;

      // Moves the circle stroke forward
      if (progressRing) {
        const progressPct = (splashStep + 1) / journeySequence.length;
        const offset = 289 - (289 * progressPct);
        progressRing.style.strokeDashoffset = offset;
      }
      
      splashStep++;
    }

    // Controls hiding splash only when animation finishes completely
    function attemptSplashHide() {
      if (isSplashFinished) {
        hideSplashScreenNow();
      } else {
        pendingSplashHide = true;
      }
    }

    function hideSplashScreenNow() {
      const splash = document.getElementById('app-splash-screen');
      if (splash) {
        splash.classList.add('opacity-0');
        setTimeout(() => splash.classList.add('hidden'), 500); // Wait for transition
      }
    }

    // Carousel and App State Timers
    let carouselInterval = null;
    let currentSlide = 0;
    let activeNotices = [];
    let headlineLoopTimer = null;
    let currentTitleState = 0;
    let titleText1 = "";
    let titleText2 = "";
    let globalActiveDataPayloadBackup = null; // Caches API payload globally
    
    let currentLocalRunningBalanceValue = null;
    let currentLocalRunningSpentValue = null;
    let countdownIntervalTrackingEngine = null;
    let budgetFlipAutoReturnTimer = null;
    let autoFetchInterval = null;

    // Initializes icons and sets date defaults on initial page parse
    lucide.createIcons(); 
    document.getElementById('todayDate').valueAsDate = new Date(); 

    // Starts background pinging to Google Apps Script (refresh every 30s)
    function startPolling() {
      if (!autoFetchInterval) autoFetchInterval = setInterval(fetchInitialData, 30000);
    }

    function stopPolling() {
      if (autoFetchInterval) {
        clearInterval(autoFetchInterval);
        autoFetchInterval = null;
      }
    }

    // Page visibility API to stop heavy polling when app is minimized
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stopPolling();
      } else {
        fetchInitialData(); 
        startPolling();
      }
    });

    // Main App Initialization
    window.onload = () => { 
      runSplashSequence(); 
      fetchInitialData(); 
      startPolling(); 
    };

    // --- PULL TO REFRESH LOGIC ---
    let touchStartY = 0;
    
    // Only captures touches at the very top of the window, outside of chat
    document.addEventListener('touchstart', e => {
      const chatModal = document.getElementById('squad-chat-modal');
      const isTouchingChat = chatModal.contains(e.target);

      if (!isTouchingChat && window.scrollY <= 5) {
        touchStartY = e.touches[0].clientY;
      } else {
        touchStartY = 0;
      }
    }, {passive: true});

    document.addEventListener('touchend', e => {
      if (window.scrollY <= 5 && touchStartY > 0) {
        let touchEndY = e.changedTouches[0].clientY;
        
        // Triggers refresh if pulled down over 100px
        if (touchEndY - touchStartY > 100) {
          if (navigator.vibrate) navigator.vibrate(15); // Haptic tick
          showToast("Syncing latest data...");
          fetchInitialData(); 
        }
      }
      touchStartY = 0;
    });
    
    // --- TAB SWITCHING MANAGER ---
    // Controls toggling between Spend, Squad, and Places views
    function showTab(tabId, el) { 
      // Reset all tabs
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active-tab')); 
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('nav-active'));
      
      // Activate target tab
      document.getElementById('view-' + tabId).classList.add('active-tab'); 
      el.classList.add('nav-active'); 
      
      // Contextual Logic: Reset UI states specific to the SPEND tab
      if (tabId === 'spend') {
        const flipper = document.getElementById('card-flipper-engine');
        if (flipper) flipper.classList.remove('flipper-rotated');
        if (isLedgerActive) toggleLedger(); // close ledger if it was open
        currentLedgerFilter = "All";
        renderLedgerList();
      }
      
      // Contextual Logic: Trigger stagger animations in SQUAD tab
      if (tabId === 'squad' && globalActiveDataPayloadBackup) { 
        triggerSequentialWaveEffects(globalActiveDataPayloadBackup, true); 
      }
      
      // Contextual Logic: Restart timeline animations in ROUTE tab
      if (tabId === 'places') {
        const tLine = document.getElementById('ui-timeline-container');
        if (tLine) {
          tLine.classList.remove('play-places-anim');
          void tLine.offsetWidth; // Force layout recalculation
          tLine.classList.add('play-places-anim');
        }

        // Delay checks for auto-scrolling to the active GPS node
        setTimeout(() => {
          const lockVault = document.getElementById('route-lock-vault');
          // Abort auto-scrolling if security vault is visible
          if (lockVault && !lockVault.classList.contains('hidden')) return; 
          
          const nodes = Array.from(document.querySelectorAll('.tracker-node'));
          if (nodes.length === 0) return;

          const activeNodes = nodes.filter(n => n.getAttribute('data-cancelled') !== 'true');
          const lastNode = activeNodes[activeNodes.length - 1];
          const isTripFinished = lastNode && lastNode.getAttribute('data-ata');

          if (isTripFinished) {
            // Trigger beautiful spring-pop complete modal if at end of timeline
            window.scrollTo({ top: 0, behavior: 'smooth' });
            if (window.popupDelayTimeout) clearTimeout(window.popupDelayTimeout);
            
            window.popupDelayTimeout = setTimeout(() => {
              const modal = document.getElementById('trip-complete-popup');
              const card = document.getElementById('trip-complete-card');
              
              if (modal && card) {
                modal.classList.remove('hidden');
                lucide.createIcons(); 
                void modal.offsetHeight; // Reflow
                modal.classList.remove('opacity-0');
                card.classList.remove('scale-75', 'opacity-0');
                card.classList.add('scale-100', 'opacity-100');
              }
            }, 900);
            
          } else {
            // Standard scroll-to-active node alignment
            let activeNode = null;
            for (let i = 0; i < nodes.length; i++) {
              if (nodes[i].getAttribute('data-ata')) {
                activeNode = nodes[i + 1] && nodes[i + 1].getAttribute('data-cancelled') !== 'true' 
                  ? nodes[i + 1] 
                  : nodes[i];
              }
            }

            if (!activeNode && nodes.length > 0) {
              activeNode = nodes.find(n => n.getAttribute('data-cancelled') !== 'true');
            }

            if (activeNode) {
              activeNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }
        }, 250);
      }
    }

    // Dismisses the Trip Complete modal gracefully
    function closeTripCompletePopup() {
      const modal = document.getElementById('trip-complete-popup');
      const card = document.getElementById('trip-complete-card');
      
      if (modal && card) {
        modal.classList.add('opacity-0');
        card.classList.replace('scale-100', 'scale-75');
        card.classList.replace('opacity-100', 'opacity-0');
        
        setTimeout(() => {
          modal.classList.add('hidden');
        }, 500); 
      }
    }

    // Handles the Bento layout transition when flipping the Balance Card
    function flipBalanceCard() { 
      const flipper = document.getElementById('card-flipper-engine'); 
      const balanceCol = document.getElementById('balance-col');
      const statsCol = document.getElementById('stats-col');
      
      flipper.classList.toggle('flipper-rotated'); 

      if (flipper.classList.contains('flipper-rotated')) {
        // Explode balance card to 100% width
        balanceCol.style.width = '100%';
        // Compress and hide the right stats column
        statsCol.style.width = '0px';
        statsCol.style.opacity = '0';
        statsCol.style.transform = 'translateX(10px) scale(0.95)';
      } else {
        // Return to 50/50 split layout
        balanceCol.style.width = 'calc(50% - 6px)';
        statsCol.style.width = 'calc(50% - 6px)';
        statsCol.style.opacity = '1';
        statsCol.style.transform = 'translateX(0px) scale(1)';
      }
    }

    // Core data fetching - Calls Google Apps Script backend 'getDashboardData'
    async function fetchInitialData() {
      try {
        const data = await apiRequest('dashboard');
        renderApp(data);
      } catch (error) {
        console.error(error);
        showToast("Unable to sync latest data.");
      }
    } 
    
    // Simple helper to format numbers as Indian Rupees string
    function formatINR(num) { return '₹' + Math.round(num).toLocaleString('en-IN'); } 
    
    // Dynamically builds the category spending bars on the back of the Balance Card
    function renderBackCategoryBars() { 
      const grid = document.getElementById('back-bars-grid');
      if (!grid || !globalAllocations) return; 
      const categories = ["Stay", "Food", "Fare", "Entry Fee", "Water", "Other"];
      grid.innerHTML = categories.map(cat => { 
        const limit = globalAllocations.limits[cat] || 0; 
        const spent = globalAllocations.spent[cat] || 0; 
        const pct = limit > 0 ? (spent / limit) * 100 : 0; 
        let labelColor = 'text-emerald-400'; 
        // Color shifts to warn users when over limits
        if (pct >= 100) labelColor = 'text-rose-500'; else if (pct > 80) labelColor = 'text-amber-400'; 
        return `<div class="flex justify-between items-center py-0.5 border-b border-slate-800"><span class="text-slate-400 text-[10px] uppercase tracking-wide font-medium">${cat}</span><span class="${labelColor} text-[11px] font-black tracking-tight">${formatINR(spent)}/<span class="text-slate-500 font-medium">${formatINR(limit)}</span></span></div>`; 
      }).join(''); 
    }

    // Manages the sliding carousel in the top navbar (General notices vs warnings)
    function runNoticeCarousel() {
      if (carouselInterval) clearInterval(carouselInterval);
      if (activeNotices.length <= 1) { document.getElementById('notice-slider').style.transform = 'translateX(0%)'; return; }
      carouselInterval = setInterval(() => {
        currentSlide = (currentSlide + 1) % activeNotices.length;
        const targetX = activeNotices[currentSlide] === 'warning' ? '-50%' : '0%';
        document.getElementById('notice-slider').style.transform = `translateX(${targetX})`;
      }, 4500);
    }

    // 3D flips the title text in the navbar every 8 seconds
    function runHeadlineCarousel(t1, t2) {
      titleText1 = t1; titleText2 = t2;
      document.getElementById('ui-title-1').innerText = titleText1;
      document.getElementById('ui-title-2').innerText = titleText2;
      if (headlineLoopTimer) clearInterval(headlineLoopTimer);
      currentTitleState = 0;
      document.getElementById('ui-headline-flipper').classList.remove('headline-rotated');
      headlineLoopTimer = setInterval(() => {
        currentTitleState = currentTitleState === 0 ? 1 : 0;
        const flipper = document.getElementById('ui-headline-flipper');
        if (flipper) { if (currentTitleState === 1) flipper.classList.add('headline-rotated'); else flipper.classList.remove('headline-rotated'); }
      }, 8000);
    }

    // API call handler for marking miscellaneous "places" as Visited/Pending
    function triggerPlaceCheck(rowId, currentStatus) {
      const nextStatus = currentStatus === 'Visited' ? 'Pending' : 'Visited';
      const targetCard = document.getElementById(`place-card-${rowId}`);
      if(targetCard) targetCard.style.opacity = '0.4'; // Visual feedback
      apiRequest('place-status', { rowId, nextStatus })
        .then(renderApp)
        .catch(error => {
          console.error(error);
          if (targetCard) targetCard.style.opacity = '1';
          showToast("Unable to update route status.");
        });
    }

    // Helper to format ISO timestamps cleanly for UI
    function formatVisitedTime(isoStr) {
      if (!isoStr) return "";
      try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return "";
        const now = new Date();
        const timeStr = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
        if (d.toDateString() === now.toDateString()) return `Today, ${timeStr}`;
        const dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        return `${dateStr}, ${timeStr}`;
      } catch(e) { return ""; }
    }

    // Renders the entire Squad tab DOM (Cards, Poll data, Permissions)
    function triggerSequentialWaveEffects(data, playAnimation = false) {
      const currentUser = localStorage.getItem('trekLoggedInUser');
      const coordinator = data.members.find(m => m.role && m.role.toLowerCase() === 'chief coordinator');
      const others = data.members.filter(m => !m.role || m.role.toLowerCase() !== 'chief coordinator'); 
      const guideUrl = (data.guidelinesUrl && data.guidelinesUrl.toString().trim() !== "") ? data.guidelinesUrl : null;
      const showContribution = data.contributionToggle === "ACTIVE";
      
      // Setup small overlay tag for the Guidelines Link
      const cardGuideTabHtml = guideUrl ? `
        <a href="${guideUrl}" target="_blank" onclick="event.stopPropagation();" class="absolute top-1/2 right-0 -translate-y-1/2 bg-slate-900/95 text-white py-3 px-1.5 rounded-l-lg shadow-xl border-y border-l border-white/10 z-50 flex flex-col items-center gap-1.5 transition-all active:scale-95">
          <i data-lucide="book-text" class="w-3.5 h-3.5 text-indigo-400"></i>
          <span class="guidelines-text text-[8px] font-black tracking-widest uppercase text-slate-100">Guidelines</span>
        </a>
      ` : '';

      // Helper to generate the Attendance Status line for cards
      const getAttSection = (attText, isDarkBg, alignment) => {
        let html = "";
        const att = attText ? attText.toLowerCase().trim() : "";
        const displayTxt = attText ? attText.trim() : "";
        
        // Dynamic coloring based on text content (await, confirm, cancel, etc)
        if (att.includes("await") || att.includes("pending")) {
            html += `<p class="text-[9px] font-black ${isDarkBg ? 'text-amber-300' : 'text-amber-500'} uppercase mt-1">(${displayTxt})</p>`;
        } else if (att.includes("confirm")) {
            html += `<p class="text-[9px] font-black ${isDarkBg ? 'text-emerald-300' : 'text-emerald-600'} uppercase mt-1">(${displayTxt})</p>`;
        } else if (att.includes("not") || att.includes("cancel")) {
            html += `<p class="text-[9px] font-black ${isDarkBg ? 'text-rose-300' : 'text-rose-600'} uppercase mt-1">(${displayTxt})</p>`;
        } else if (att !== "") {
            html += `<p class="text-[9px] font-black ${isDarkBg ? 'text-slate-300' : 'text-slate-500'} uppercase mt-1">(${displayTxt})</p>`;
        }
        
        if (html === "") return "";

        let flexAlign = "items-center";
        if (alignment === "right") flexAlign = "items-end";
        if (alignment === "left") flexAlign = "items-start";

        return `<div class="flex flex-col w-full ${flexAlign}">${html}</div>`;
      };

      // Helper to split Names securely
      const formatName = (fullName) => {
        const parts = fullName.trim().split(' ');
        if (parts.length === 1) return { first: parts[0], last: '' };
        return { first: parts[0], last: parts.slice(1).join(' ') };
      };

      // RENDER COORDINATOR CARD
      if (coordinator) {
        const loggedInPIN = localStorage.getItem('trekLoggedInPIN');
        const isCurrentCoordUser = (coordinator.pin === loggedInPIN);
        const { first: cFirst, last: cLast } = formatName(coordinator.name);
        
        // Ledger Sign-off processing
        const isCoordSigned = coordinator.finalSignOff && coordinator.finalSignOff.length > 50;
        const coordFade = isCoordSigned ? 'opacity-60 grayscale-[30%] transition-opacity duration-1000' : '';
        let signOffBtnCoord = '';
        
        if (data.signOffStatus === "signing off") {
          if (isCoordSigned) {
            signOffBtnCoord = `<div class="absolute top-2 right-2 z-40 bg-slate-100/90 text-slate-600 text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-md border border-slate-200 shadow-sm pointer-events-none flex items-center gap-1">Signed Off <i data-lucide="badge-check" class="w-3 h-3 text-emerald-500 stroke-[3]"></i></div>`;
          } else if (isCurrentCoordUser) {
            signOffBtnCoord = `<button onclick="event.stopPropagation(); openSignaturePad('${coordinator.pin}')" class="absolute top-2 right-2 z-40 bg-slate-900 text-white text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5"><span class="relative flex h-2 w-2"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span></span>SIGN OFF</button>`;
          } else {
            signOffBtnCoord = `<div class="absolute top-2 right-2 z-40 bg-slate-50/80 text-slate-400 text-[8px] font-bold uppercase tracking-widest px-2 py-1 rounded-md border border-slate-200 shadow-sm pointer-events-none">Awaiting Sign ⏱</div>`;
          }
        }

        // Build HTML for the Front of the Card (Image Layout vs Fallback layout)
        let coordFrontHtml = "";
        if (coordinator.img) {
          coordFrontHtml = `
            <div class="squad-front bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl shadow-md flex relative overflow-visible h-full w-full ${coordFade}">
              ${signOffBtnCoord}
              ${cardGuideTabHtml}
              <div class="absolute top-4 right-4 p-2 opacity-20 pointer-events-none z-0">
                <i data-lucide="award" class="w-16 h-16 text-white"></i>
              </div>
              ${coordinator.bgImage ? `<div class="absolute left-0 top-0 bottom-0 w-[65%] bg-cover bg-center rounded-l-2xl z-10" style="background-image: url('${coordinator.bgImage}'); clip-path: polygon(0 0, 100% 0, 75% 100%, 0% 100%);"></div>` : ''}
              <div class="absolute bottom-0 left-0 w-[45%] h-[120%] z-20 flex items-end justify-center pointer-events-none">
                <img src="${coordinator.img}" class="w-full h-full object-contain object-bottom drop-shadow-2xl">
              </div>
              ${coordinator.signature && coordinator.signature.startsWith("http") ? `
              <div class="absolute bottom-0 -right-2 w-[55%] h-[115%] z-0 flex items-end justify-center pointer-events-none opacity-60">
                <img src="${coordinator.signature}" class="ml-4 w-full h-full object-contain object-left-bottom drop-shadow-xl">
              </div>` : ''}
              <div class="absolute top-0 right-0 w-[55%] h-full py-4 pr-4 pl-1 flex flex-col justify-center items-start z-10 text-left">
                <div class="mb-2">
                  <p class="text-2xl font-black tracking-tight text-white leading-none">${cFirst}</p>
                  ${cLast ? `<p class="text-base font-extrabold tracking-tight text-indigo-200 leading-tight">${cLast}</p>` : ''}
                </div>
                <p class="text-[9px] font-black uppercase tracking-[0.2em] text-white/70 mb-1 border-b border-white/20 pb-1">Chief Coordinator</p>
                <div class="scale-90 origin-left w-full">${getAttSection(coordinator.attendance, true, 'left')}</div>
              </div>
            </div>`;
        } else {
          coordFrontHtml = `
            <div class="squad-front bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl shadow-md flex relative overflow-visible h-full w-full ${coordFade}">
              ${signOffBtnCoord}
              ${cardGuideTabHtml}
              ${coordinator.signature && coordinator.signature.startsWith("http") ? `
              <div class="absolute bottom-0 right-0 w-[55%] h-[115%] z-0 flex items-end justify-center pointer-events-none opacity-60">
                <img src="${coordinator.signature}" class="ml-4 w-full h-full object-contain object-left-bottom drop-shadow-xl">
              </div>` : ''}
              <div class="relative w-16 h-16 bg-white/10 rounded-full border-[2px] border-white/20 shadow-inner flex items-center justify-center mb-3 z-10">
                <i data-lucide="award" class="w-8 h-8 text-indigo-50"></i>
              </div>
              <p class="text-xl font-black z-10 tracking-wide">${coordinator.name}</p>
              <p class="text-[10px] font-bold uppercase tracking-[0.2em] z-10 text-indigo-200 mt-1">Chief Coordinator</p>
              <div class="mt-1.5 z-10 w-full">${getAttSection(coordinator.attendance, true, 'center')}</div>
            </div>`;
        }

        // Money bookmark drop down appended below the card
        const coordBookmark = showContribution ? `
        <div class="flex justify-center relative z-0 transition-all duration-500">
          <div class="bg-indigo-950 text-white px-5 py-2 rounded-b-2xl shadow-md border-x border-b border-indigo-900 flex flex-row items-center justify-center gap-2 min-w-[60%]">
            <span class="text-[8px] font-bold text-indigo-300 uppercase tracking-widest">Contribution:</span>
            <span class="text-xs font-black text-emerald-400">${formatINR(coordinator.contribution)}</span>
          </div>
        </div>` : '';

        // Inject the completed coordinator DOM without the old back card assets
        document.getElementById('leaderSection').innerHTML = `
        <div class="squad-leader-box mt-2">
          <div id="lead-flip-engine" onclick="executeCardFlipCycle('lead-flip-engine')" class="h-[180px] relative z-10 cursor-pointer">
            ${coordFrontHtml}
          </div>
          ${coordBookmark}
        </div>`;
      } else {
        document.getElementById('leaderSection').innerHTML = '';
      }

      // RENDER ALL OTHER MEMBERS
      const memList = document.getElementById('memberList');
      memList.className = 'grid grid-cols-2 gap-3'; 

      memList.innerHTML = others.map((m, index) => {
        const structuralStaggerDelay = index * 40; 
        const loggedInPIN = localStorage.getItem('trekLoggedInPIN');
        const isCurrentMemUser = (m.pin === loggedInPIN); 
        const { first: mFirst, last: mLast } = formatName(m.name);
        
        // Ledger Sign-off processing
        const isMemSigned = m.finalSignOff && m.finalSignOff.length > 50;
        const memFade = isMemSigned ? 'opacity-60 grayscale-[30%] transition-opacity duration-1000' : '';
        let signOffBtnMem = '';
        
        if (data.signOffStatus === "signing off") {
          if (isMemSigned) {
            signOffBtnMem = `<div class="absolute top-2 right-2 z-40 bg-slate-100/90 text-slate-600 text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-md border border-slate-200 shadow-sm pointer-events-none flex items-center gap-1">Signed Off <i data-lucide="badge-check" class="w-3 h-3 text-emerald-500 stroke-[3]"></i></div>`;
          } else if (isCurrentMemUser) {
            signOffBtnMem = `<button onclick="event.stopPropagation(); openSignaturePad('${m.pin}')" class="absolute top-2 right-2 z-40 bg-slate-900 text-white text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5"><span class="relative flex h-2 w-2"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span></span>SIGN OFF</button>`;
          } else {
            signOffBtnMem = `<div class="absolute top-2 right-2 z-40 bg-slate-50/80 text-slate-400 text-[8px] font-bold uppercase tracking-widest px-2 py-1 rounded-md border border-slate-200 shadow-sm pointer-events-none">Awaiting Sign ⏱</div>`;
          }
        }

        // Logic to dynamically resize typography based on length of name
        let memberFrontHtml = "";
        if (m.img) {
          const fSizeClass = mFirst.length > 7 ? 'text-sm' : 'text-xl';
          const fSizePx = mFirst.length > 7 ? 14 : 20;
          let lSizePx = 16;
          let fLetterSpacing = "";
          
          if (mLast) {
              const firstWidth = mFirst.length * fSizePx;
              const maxLastWidth = firstWidth * 0.85;
              lSizePx = Math.floor(maxLastWidth / mLast.length);
              if (lSizePx >= fSizePx) lSizePx = fSizePx - 2;
              if (lSizePx < 8) {
                  lSizePx = 8; 
                  const actualLastWidth = mLast.length * 8;
                  if (actualLastWidth > maxLastWidth) {
                      const extraSpaceNeeded = actualLastWidth - maxLastWidth;
                      const spacingPerLetter = (extraSpaceNeeded / mFirst.length).toFixed(1);
                      fLetterSpacing = `letter-spacing: ${spacingPerLetter}px;`;
                  }
              }
          }

          memberFrontHtml = `
              <div class="squad-front bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow relative overflow-visible h-full w-full ${memFade}">
                ${signOffBtnMem}
                ${m.bgImage ? `<div class="absolute left-0 top-0 bottom-0 w-[65%] bg-cover bg-center rounded-l-2xl z-10" style="background-image: url('${m.bgImage}'); clip-path: polygon(0 0, 100% 0, 75% 100%, 0% 100%);"></div>` : ''}
                <div class="absolute bottom-0 -left-2 w-[55%] h-[115%] z-20 flex items-end justify-center pointer-events-none">
                  <img src="${m.img}" class="w-full h-full object-contain object-bottom drop-shadow-xl">
                </div>
                ${m.signature && m.signature.startsWith("http") ? `
                <div class="absolute bottom-0 -right-2 w-[55%] h-[115%] z-0 flex items-end justify-center pointer-events-none opacity-80">
                  <img src="${m.signature}" class="w-full h-full object-contain object-bottom drop-shadow-sm">
                </div>` : ''}
                <div class="absolute top-0 right-0 w-[50%] h-full py-2 pr-3 flex flex-col justify-center items-end z-10 text-right overflow-hidden">
                  <p class="font-black text-indigo-600 ${fSizeClass} uppercase leading-none w-full whitespace-nowrap" style="${fLetterSpacing}">${mFirst}</p>
                  ${mLast ? `<p class="font-black text-slate-700 uppercase leading-none tracking-tighter w-full mt-0.5 whitespace-nowrap" style="font-size: ${lSizePx}px;">${mLast}</p>` : ''}
                  <div class="w-[70%] h-[1px] bg-slate-200 my-1.5"></div>
                  <p class="text-[8px] text-slate-600 font-extrabold uppercase tracking-widest w-full whitespace-nowrap">${m.role || 'Member'}</p>
                  ${(m.attendance && m.attendance.trim() !== "") || (m.signature && m.signature.startsWith("http")) ? `<div class="w-full h-[1px] bg-slate-200 my-1.5"></div>` : ''}
                  <div class="origin-right scale-[0.85] w-[120%] -mt-0.5">${getAttSection(m.attendance, false, 'right')}</div>
                </div>
              </div>`;
        } else {
          memberFrontHtml = `
            <div class="squad-front bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow relative overflow-visible h-full w-full ${memFade}">
              ${signOffBtnMem}
              ${m.signature && m.signature.startsWith("http") ? `
              <div class="absolute bottom-0 right-0 w-[55%] h-[115%] z-0 flex items-end justify-center pointer-events-none opacity-80">
                <img src="${m.signature}" class="w-full h-full object-contain object-bottom drop-shadow-sm">
              </div>` : ''}
              <div class="relative w-14 h-14 bg-slate-50 rounded-full overflow-hidden border-2 border-indigo-50 mb-2 flex items-center justify-center font-bold text-indigo-600 text-lg">
                ${m.num}
              </div>
              <p class="font-extrabold text-slate-800 text-sm text-center w-full px-1 truncate">${m.name}</p>
              <p class="text-[9px] text-slate-400 font-bold uppercase tracking-wider text-center mt-0.5">${m.role || 'Member'}</p>
              <div class="mt-1 w-full z-10">${getAttSection(m.attendance, false, 'center')}</div>
            </div>`;
        }

        const memBookmark = showContribution ? `
        <div class="flex justify-center relative z-0 transition-all duration-500">
          <div class="bg-slate-800 text-white px-3 py-1.5 rounded-b-xl shadow-sm border-x border-b border-slate-700 flex flex-row items-center justify-center gap-1.5 min-w-[75%]">
            <span class="text-[7px] font-bold text-slate-400 uppercase tracking-widest">Contribution:</span>
            <span class="text-[10px] font-black text-emerald-400">${formatINR(m.contribution)}</span>
          </div>
        </div>` : '';

        return `
        <div style="animation-delay: ${structuralStaggerDelay}ms;" class="squad-scene-box ${playAnimation ? 'animate-wave-member' : ''}">
          <div id="mem-flip-engine-${index}" onclick="executeCardFlipCycle('mem-flip-engine-${index}')" class="h-[144px] relative z-10 cursor-pointer">
            ${memberFrontHtml}
          </div>
          ${memBookmark}
        </div>`;
      }).join('');
      lucide.createIcons();
    }

    // Number ticker logic for animating balance/spent changes dynamically
    function runFluidCountdownAnimationSequence(targetBalance, targetSpent) {
      if (countdownIntervalTrackingEngine) clearInterval(countdownIntervalTrackingEngine);
      const balanceTextNode = document.getElementById('stat-balance');
      const spentTextNode = document.getElementById('stat-spent');
      
      // If first load, snap to values instantly
      if (currentLocalRunningBalanceValue === null || currentLocalRunningSpentValue === null) {
        currentLocalRunningBalanceValue = targetBalance; currentLocalRunningSpentValue = targetSpent;
        if (balanceTextNode) balanceTextNode.innerText = formatINR(targetBalance);
        if (spentTextNode) spentTextNode.innerText = formatINR(targetSpent);
        return;
      }
      
      const balanceGap = targetBalance - currentLocalRunningBalanceValue;
      const spentGap = targetSpent - currentLocalRunningSpentValue;
      
      if (balanceGap === 0 && spentGap === 0) {
        if (balanceTextNode) balanceTextNode.innerText = formatINR(targetBalance);
        if (spentTextNode) spentTextNode.innerText = formatINR(targetSpent);
        return;
      }
      
      // Configuration for the ticking animation
      const totalDurationTimeWindow = 450; const frameRateSteps = 30; const stepDurationInterval = totalDurationTimeWindow / frameRateSteps;
      let currentExecutionStep = 0;
      const initialBalanceSnapshot = currentLocalRunningBalanceValue;
      const initialSpentSnapshot = currentLocalRunningSpentValue;
      
      countdownIntervalTrackingEngine = setInterval(() => {
        currentExecutionStep++;
        const progressRatio = currentExecutionStep / frameRateSteps;
        const currentBalanceFrame = initialBalanceSnapshot + (balanceGap * progressRatio);
        const currentSpentFrame = initialSpentSnapshot + (spentGap * progressRatio);
        
        if (balanceTextNode) balanceTextNode.innerText = formatINR(currentBalanceFrame);
        if (spentTextNode) spentTextNode.innerText = formatINR(currentSpentFrame);
        
        if (currentExecutionStep >= frameRateSteps) {
          clearInterval(countdownIntervalTrackingEngine);
          currentLocalRunningBalanceValue = targetBalance; currentLocalRunningSpentValue = targetSpent;
          if (balanceTextNode) balanceTextNode.innerText = formatINR(targetBalance);
          if (spentTextNode) spentTextNode.innerText = formatINR(targetSpent);
        }
      }, stepDurationInterval);
    }

    // Trigger visual flip confirmation when spending form is successfully processed
    function triggerBudgetPeekConfirmationFlip(lastAmount, lastNotes) {
      if (budgetFlipAutoReturnTimer) clearTimeout(budgetFlipAutoReturnTimer);
      const budgetFlipperCardNode = document.getElementById('ui-budget-flip-engine');
      const titleRowNode = document.getElementById('ui-peek-title-row');
      const notesRowNode = document.getElementById('ui-peek-notes-row');
      
      if (!budgetFlipperCardNode || !titleRowNode || !notesRowNode) return;
      titleRowNode.innerText = `Recorded: ₹${Math.round(lastAmount)}`;
      notesRowNode.innerText = `for ${lastNotes || 'Expense'}`;
      budgetFlipperCardNode.classList.add('budget-flipped');
      
      budgetFlipAutoReturnTimer = setTimeout(() => { budgetFlipperCardNode.classList.remove('budget-flipped'); }, 2500);
    }

    // Global utility helper to split paragraph text into bullet points at every full stop
    function formatRolesToBullets(text) {
      if (!text || text === "No specific role assigned.") {
        return `<p class="text-center text-slate-400 italic mt-2 w-full">No specific role assigned.</p>`;
      }
      // Split by full stop, remove extra spaces, and filter out empty chunks
      const points = text.split('.').map(p => p.trim()).filter(p => p.length > 0);
      // Map into an HTML bulleted list
      const listItems = points.map(p => `<li>${p}.</li>`).join('');
      return `<ul class="list-disc pl-4 text-left w-full space-y-1.5">${listItems}</ul>`;
    }

    // Replaces the card flip with a centered spring modal matching the Trip Complete layout style
    function executeCardFlipCycle(elementId) {
      if (!globalActiveDataPayloadBackup) return;

      let member = null;
      
      // Determine if clicking the chief coordinator or a standard squad member card
      if (elementId === 'lead-flip-engine') {
        member = globalActiveDataPayloadBackup.members.find(m => m.role && m.role.toLowerCase() === 'chief coordinator');
      } else {
        const index = parseInt(elementId.replace('mem-flip-engine-', ''));
        const others = globalActiveDataPayloadBackup.members.filter(m => !m.role || m.role.toLowerCase() !== 'chief coordinator');
        member = others[index];
      }

      if (!member) return;

      // Populate layout details
      document.getElementById('modal-role-member-name').innerText = member.name;
      document.getElementById('modal-role-content').innerHTML = formatRolesToBullets(member.assignedRoleDetail);

      const modal = document.getElementById('role-details-modal');
      const card = document.getElementById('role-details-card');

      if (modal && card) {
        modal.classList.remove('hidden');
        lucide.createIcons(); 
        void modal.offsetHeight; // Force layout recalculation reflow
        
        modal.classList.remove('opacity-0');
        card.classList.replace('scale-75', 'scale-100');
        card.classList.replace('opacity-0', 'opacity-100');
      }
    }

    // Graceful spring dismiss layout
    function closeRoleDetailsModal() {
      const modal = document.getElementById('role-details-modal');
      const card = document.getElementById('role-details-card');
      
      if (modal && card) {
        modal.classList.add('opacity-0');
        card.classList.replace('scale-100', 'scale-75');
        card.classList.replace('opacity-100', 'opacity-0');
        
        setTimeout(() => {
          modal.classList.add('hidden');
        }, 500); 
      }
    }


    // ==========================================
    // THE MASTER RENDER ENGINE
    // Receives fresh data from Google Apps Script and updates the DOM
    // ==========================================
    function renderApp(data) { 
      refreshMenuSignOffButton(data);
      
      // 1. VIP Wristband & Login Check - Stops flow if user not authenticated
      const currentUser = localStorage.getItem('trekLoggedInUser');
      const currentPIN = localStorage.getItem('trekLoggedInPIN');
      const loginOverlay = document.getElementById('login-overlay');
      
      if (!currentUser) {
        loginOverlay.classList.remove('hidden');
        const selectDropdown = document.getElementById('login-name-select');
        // Populate names list
        if (selectDropdown && selectDropdown.options.length === 0) {
          selectDropdown.innerHTML = data.members.map(m => `<option value="${m.name}">${m.name}</option>`).join('');
        }
        attemptSplashHide();
        return; // App tab rendering halts until login completes
      } else {
        loginOverlay.classList.add('hidden');
      }
      
      // 2. Check the global trip live status
      const lockScreen = document.getElementById('live-lock-screen');
      if (data.appStatus === "CLOSED" || data.appStatus === "LOCKED") {
        lockScreen.classList.remove('hidden');
        document.body.classList.add('overflow-hidden', 'touch-none'); // 🔒 Freezes the screen
        return; 
      } else {
        lockScreen.classList.add('hidden');
        document.body.classList.remove('overflow-hidden', 'touch-none'); // 🔓 Unlocks the screen
      }
      
      globalActiveDataPayloadBackup = data;
      
      // 3. Trigger chat UI update
      renderChatData(data.messages);

      // --- EXPENSE LOCK ENGINE ---
      const expenseLockOverlay = document.getElementById('expense-lock-overlay');
      const swipeTrack = document.getElementById('swipe-track');

      if (data.expenseStatus === "STOP Expense") {
          // Show the lock UI and disable slider
          if(expenseLockOverlay) expenseLockOverlay.classList.remove('hidden');
          if(swipeTrack) {
              swipeTrack.style.pointerEvents = 'none';
              swipeTrack.style.opacity = '0.5';
              document.getElementById('swipe-text').innerText = "ENTRIES PAUSED";
          }
      } else { 
          // Re-enable form usage
          if(expenseLockOverlay) expenseLockOverlay.classList.add('hidden');
          if(swipeTrack) {
              swipeTrack.style.pointerEvents = 'auto';
              swipeTrack.style.opacity = '1';
              document.getElementById('swipe-text').innerText = "SWIPE TO SAVE";
          }
      }
      
      // --- LIVE ROUTE LOCK ENGINE ---
      const routeVault = document.getElementById('route-lock-vault');
      const routeNavBtn = document.getElementById('nav-btn-route');
      const routeView = document.getElementById('view-places');
      const secureContent = document.getElementById('route-secure-content');

      if (data.routeStatus === "LOCKED") {
        routeVault.classList.remove('hidden');
        routeNavBtn.classList.remove('hidden');
        
        // ANTI-SWIPE FIX: Freeze height and hide overflow so user cannot scroll past vault
        routeView.style.height = 'calc(100vh - 180px)';
        routeView.style.overflow = 'hidden';
        
        // FROSTED GLASS FIX: Blur and disable the actual content behind the vault
        if (secureContent) {
          secureContent.classList.add('blur-[8px]', 'opacity-40', 'pointer-events-none', 'select-none');
        }

      } else if (data.routeStatus === "STEALTH") {
        routeNavBtn.classList.add('hidden'); // Hide completely from Nav
        if (routeView.classList.contains('active-tab')) {
          showTab('spend', document.querySelector('.nav-btn')); // Eject user if viewing it
        }
      } else { 
        // UNLOCKED: Restore full visibility and scrollability
        routeVault.classList.add('hidden');
        routeNavBtn.classList.remove('hidden');
        routeView.style.height = 'auto';
        routeView.style.overflow = 'visible';
        if (secureContent) {
          secureContent.classList.remove('blur-[8px]', 'opacity-40', 'pointer-events-none', 'select-none');
        }
      }

      // SYNC THE TRIP REPORT LINK IN THE MORE MENU
      const moreTripReportBtn = document.getElementById('ui-more-tripreport');
      if (moreTripReportBtn) {
        if (data.tripReportUrl && data.tripReportUrl.toString().trim() !== "") {
          moreTripReportBtn.href = data.tripReportUrl;
          moreTripReportBtn.classList.remove('opacity-50', 'pointer-events-none');
        } else {
          moreTripReportBtn.href = "#";
          moreTripReportBtn.classList.add('opacity-50', 'pointer-events-none');
        }
      }

      // SYNC THE TRIP REPORT SUBHEADING
      const reportSubtext = document.getElementById('ui-more-tripreport-subtext');
      if (reportSubtext) {
        if (data.tripReportSubheading && data.tripReportSubheading.toString().trim() !== "") {
          reportSubtext.innerText = data.tripReportSubheading;
          reportSubtext.classList.remove('hidden');
        } else {
          reportSubtext.classList.add('hidden');
        }
      }

      const moreGuidelinesBtn = document.getElementById('ui-more-guidelines');
      if (moreGuidelinesBtn) {
        if (data.guidelinesUrl && data.guidelinesUrl.toString().trim() !== "") {
          moreGuidelinesBtn.href = data.guidelinesUrl;
          moreGuidelinesBtn.classList.remove('opacity-50', 'pointer-events-none');
        } else {
          moreGuidelinesBtn.href = "#";
          moreGuidelinesBtn.classList.add('opacity-50', 'pointer-events-none');
        }
      }
      
      document.getElementById('ui-timeline-container').classList.remove('play-places-anim');
      
      if (titleText1 !== data.tripName || titleText2 !== data.secondaryTitle) { 
          runHeadlineCarousel(data.tripName, data.secondaryTitle); 
      }
      
      if (data.allocations) { globalAllocations = data.allocations; renderBackCategoryBars(); } 
      if (data.members) { cachedMembersList = data.members; }
      
      
      
      // Process Notice bar updates
      const noticeBox = document.getElementById('notice-container');
      const standardNoticeEl = document.getElementById('ui-trip-notice');
      const warningNoticeEl = document.getElementById('ui-warning-notice');
      activeNotices = []; currentSlide = 0;
      if (data.tripNotice && data.tripNotice.trim() !== "") { standardNoticeEl.innerText = data.tripNotice; activeNotices.push('standard'); }
      if (data.warningNotice && data.warningNotice.trim() !== "") { warningNoticeEl.innerText = data.warningNotice; activeNotices.push('warning'); }
      if (activeNotices.length > 0) { noticeBox.classList.remove('hidden'); runNoticeCarousel(); } else { noticeBox.classList.add('hidden'); if (carouselInterval) clearInterval(carouselInterval); }

      // --- SAFE COUNTDOWN TIMER LOGIC ---
      if (data.timeData.start && data.timeData.end) { 
        const start = data.timeData.start, end = data.timeData.end, now = new Date().getTime();
        const timerContainer = document.getElementById('timer-container');
        const timerText = document.getElementById('ui-timer-text');
        
        if (timerContainer && timerText) {
          if (now < start) { 
            const days = Math.floor((start - now) / 86400000);
            timerContainer.classList.remove('hidden'); 
            timerText.innerText = `Starts in ${days} Days`; 
          } else if (now >= start && now < end) { 
            timerContainer.classList.remove('hidden'); 
            const rem = end - now; 
            const daysLeft = Math.floor(rem / 86400000);
            const hoursLeft = Math.floor((rem % 86400000) / 3600000);
            const minsLeft = Math.floor((rem % 3600000) / 60000);
            timerText.innerText = `${daysLeft}D ${hoursLeft}H ${minsLeft}M Left`; 
          } else { 
            timerContainer.classList.remove('hidden');
            timerText.innerText = `Trip Ended`; 
          }
        }
      }
      
      // Trigger stat counter animations
      document.getElementById('stat-budget').innerText = formatINR(data.stats.budget);
      runFluidCountdownAnimationSequence(data.stats.balance, data.stats.expenses);
      
      // --- SPEND TAB RENDER (Budget limits and balance dynamic UI) ---
      const balanceCard = document.getElementById('balance-card'); 
      const balanceLabel = document.getElementById('balance-label'); 
      const balanceVal = document.getElementById('stat-balance');
      const hintFooter = document.getElementById('balance-hint-footer');
      const dotPing = document.getElementById('dot-ping'); 
      const dotMain = document.getElementById('dot-main'); 
      const pLeft = data.stats.percentLeft;
      const currentBalance = data.stats.balance;

      // Structural base classes with Matte Physical depth
      balanceCard.className = "face-front w-full h-full p-4 rounded-[24px] border border-white/60 transition-all duration-300 text-center flex flex-col justify-between items-center active:scale-[0.96] active:shadow-[0_2px_4px_rgba(0,0,0,0.02),inset_0_2px_4px_rgba(0,0,0,0.02)] cursor-pointer";
      if(dotPing) dotPing.className = "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"; 
      if(dotMain) dotMain.className = "relative inline-flex rounded-full h-2 w-2";

      // Apply gradients and drop shadows based on remaining budget tiers
      if (currentBalance < 0) {
        // Danger Tier - Negative Balance
        balanceCard.classList.add('bg-gradient-to-b', 'from-rose-50', 'to-rose-100', 'warning-pulse', 'shadow-[0_12px_24px_rgba(225,29,72,0.08),inset_0_2px_6px_rgba(255,255,255,0.9)]');
        if(balanceLabel) { 
          balanceLabel.className = "text-[9.5px] font-black text-rose-600 uppercase tracking-widest drop-shadow-sm"; 
          balanceLabel.innerText = "BUDGET EXCEEDED"; 
        }
        if(balanceVal) balanceVal.className = "text-3xl font-black text-rose-700 tracking-tight text-center drop-shadow-sm";
        if(hintFooter) hintFooter.className = "text-[9px] font-bold uppercase tracking-wider text-rose-600 flex items-center justify-center gap-1 transition-colors duration-500 w-full drop-shadow-sm";
        if(dotPing) dotPing.classList.add('bg-rose-500'); if(dotMain) dotMain.classList.add('bg-rose-600');
      } else if (pLeft > 20) { 
        // Safe Tier
        balanceCard.classList.add('bg-gradient-to-b', 'from-emerald-50', 'to-emerald-100', 'shadow-[0_12px_24px_rgba(16,185,129,0.06),inset_0_2px_6px_rgba(255,255,255,0.9)]');
        if(balanceLabel) { balanceLabel.className = "text-[9.5px] font-black text-emerald-600 uppercase tracking-widest drop-shadow-sm"; balanceLabel.innerText = "Remaining"; }
        if(balanceVal) balanceVal.className = "text-3xl font-black text-emerald-700 tracking-tight text-center drop-shadow-sm";
        if(hintFooter) hintFooter.className = "text-[9px] font-bold uppercase tracking-wider text-emerald-700 flex items-center justify-center gap-1 transition-colors duration-500 w-full drop-shadow-sm";
        if(dotPing) dotPing.classList.add('bg-emerald-500'); if(dotMain) dotMain.classList.add('bg-emerald-600');
      } else if (pLeft > 10) { 
        // Warning Tier
        balanceCard.classList.add('bg-gradient-to-b', 'from-amber-50', 'to-amber-100', 'shadow-[0_12px_24px_rgba(245,158,11,0.06),inset_0_2px_6px_rgba(255,255,255,0.9)]');
        if(balanceLabel) { balanceLabel.className = "text-[9.5px] font-black text-amber-600 uppercase tracking-widest drop-shadow-sm"; balanceLabel.innerText = "Remaining"; }
        if(balanceVal) balanceVal.className = "text-3xl font-black text-amber-700 tracking-tight text-center drop-shadow-sm";
        if(hintFooter) hintFooter.className = "text-[9px] font-bold uppercase tracking-wider text-amber-700 flex items-center justify-center gap-1 transition-colors duration-500 w-full drop-shadow-sm";
        if(dotPing) dotPing.classList.add('bg-amber-500'); if(dotMain) dotMain.classList.add('bg-amber-600');
      } else { 
        // Critical Tier (< 10% remaining)
        balanceCard.classList.add('bg-gradient-to-b', 'from-rose-50', 'to-rose-100', 'warning-pulse', 'shadow-[0_12px_24px_rgba(225,29,72,0.08),inset_0_2px_6px_rgba(255,255,255,0.9)]');
        if(balanceLabel) { balanceLabel.className = "text-[9.5px] font-black text-rose-600 uppercase tracking-widest drop-shadow-sm"; balanceLabel.innerText = "Remaining"; }
        if(balanceVal) balanceVal.className = "text-3xl font-black text-rose-700 tracking-tight text-center drop-shadow-sm";
        if(hintFooter) hintFooter.className = "text-[9px] font-bold uppercase tracking-wider text-rose-600 flex items-center justify-center gap-1 transition-colors duration-500 w-full drop-shadow-sm";
        if(dotPing) dotPing.classList.add('bg-rose-500'); if(dotMain) dotMain.classList.add('bg-rose-600');
      }

      // Pre-calculate which ledger items breached the budget limit
      let runningTotal = 0;
      const budgetLimit = data.stats.budget;
      
      // Process from oldest to newest to find exactly when the budget broke
      globalLedgerDataBackup = [...data.transactions].reverse().map(t => {
        runningTotal += (parseFloat(t.amount) || 0);
        return { ...t, overBudget: runningTotal > budgetLimit };
      }).reverse(); // Reverse back so newest is at the top of the UI

      // Render the ledger elements using the newly formed global array
      renderLedgerList();
      
      // Renders the Squad view cards
      triggerSequentialWaveEffects(data);
      
      // --- ROUTE/PLACES RENDERING ENGINE ---
      const activeContainer = document.getElementById('activePlaceList');
      const visitedContainer = document.getElementById('visitedPlaceList');
      let activeHtml = "", visitedHtml = "", activeCount = 0, visitedCount = 0;

      // Render the small "checklist" places
      data.places.forEach(p => {
        if (!p.name || p.name.toString().trim() === "" || p.rowId === 1) return; 

        if (p.status === 'Visited') {
          visitedCount++; 
          const formattedStamp = formatVisitedTime(p.timeString);
          visitedHtml += `<div id="place-card-${p.rowId}" class="bg-white px-4 py-3.5 rounded-xl border border-slate-200/60 shadow-sm flex items-center justify-between opacity-65 transition-all duration-300"><div class="flex items-center gap-3 truncate pr-2 w-full justify-between"><div class="flex items-center gap-3 truncate pr-1"><button onclick="triggerPlaceCheck(${p.rowId}, 'Visited')" class="w-5 h-5 flex-shrink-0 bg-emerald-500 rounded-full flex items-center justify-center text-white border border-emerald-600 outline-none"><i data-lucide="check" class="w-3 h-3 stroke-[3]"></i></button><div class="truncate"><p class="font-bold text-slate-500 text-sm line-through decoration-slate-400 truncate">${p.name}</p>${p.note ? `<p class="text-[10px] text-slate-400 truncate mt-0.5">${p.note}</p>` : ''}</div></div><span class="text-[10px] font-semibold text-slate-400 flex-shrink-0 bg-slate-100 rounded-md px-1.5 py-0.5">${formattedStamp}</span></div></div>`;
        } else {
          activeCount++;
          activeHtml += `<div id="place-card-${p.rowId}" class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between transition-all duration-300"><div class="flex items-center gap-3 truncate pr-2"><button onclick="triggerPlaceCheck(${p.rowId}, 'Pending')" class="w-5 h-5 flex-shrink-0 rounded-full border border-slate-300 hover:border-indigo-500 flex items-center justify-center bg-slate-50 outline-none transition-colors"></button><div class="truncate"><p class="font-bold text-slate-800 text-sm truncate">${p.name}</p>${p.note ? `<p class="text-xs text-slate-400 truncate mt-0.5">${p.note}</p>` : ''}</div></div></div>`;
        }
      });

      // Show/hide sections based on data presence
      document.getElementById('ui-places-divider').className = activeCount > 0 ? "w-full h-[1px] bg-slate-200 my-8 block" : "hidden";
      document.getElementById('head-active-places').className = activeCount > 0 ? "text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 block" : "hidden";
      document.getElementById('head-visited-places').className = visitedCount > 0 ? "text-[10px] font-bold text-emerald-500 uppercase tracking-widest px-1 block mt-4" : "hidden";
      activeContainer.innerHTML = activeHtml; 
      visitedContainer.innerHTML = visitedHtml;

      // Render the Main Vertical Route Timeline
      const groupedPlaces = {};
      let timelineCount = 0;
      let lastReachedRowId = null;

      // Group nodes by "Day" text identifier
     data.places.forEach(p => {
  if (!p.tripDay && !p.location) return;

        const dayGroup = p.tripDay || "Unscheduled";
        if (!groupedPlaces[dayGroup]) groupedPlaces[dayGroup] = [];
        groupedPlaces[dayGroup].push(p);
        timelineCount++;

        if (p.ata) lastReachedRowId = p.rowId;
      });

      let scheduleHtml = "";
      let animStep = 0;

      if (timelineCount > 0) {
        // THE MASTER TRACK (Continuous vertical line + Dynamic Progress Fill + Gliding Dot)
        scheduleHtml += `<div class="relative w-full pt-2 pb-6" id="master-timeline-wrap">
          
          <div id="live-track-fill" class="absolute left-[79px] top-6 w-[2px] bg-indigo-500 z-[1] transition-all duration-[1000ms] ease-[cubic-bezier(0.25,1,0.5,1)] origin-top" style="height: 0px;"></div>
          <div id="live-train-dot" class="absolute left-[75px] top-0 w-[10px] h-[10px] bg-emerald-400 rounded-full shadow-[0_0_10px_rgba(52,211,153,0.8)] z-[2] transition-all duration-[1000ms] ease-[cubic-bezier(0.25,1,0.5,1)] opacity-0 border border-white"></div>`;

        const dayKeys = Object.keys(groupedPlaces);
        dayKeys.forEach((day, dayIndex) => {
          const firstItemDate = groupedPlaces[day][0].targetDate || "";
          const headerText = firstItemDate ? `${day} • ${firstItemDate}` : day;
          
          let badgeDelay = animStep * 12; 

          // Output the Day Badges
          scheduleHtml += `
            <div class="mb-8">
              <div class="sticky top-0 bg-slate-50/90 backdrop-blur-sm py-2 z-30 anim-badge" style="animation-delay: ${badgeDelay}ms;">
                <span class="bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-md">${headerText}</span>
              </div>
              <div class="border-l-2 border-transparent ml-20 mt-4 space-y-6 relative">`;

          groupedPlaces[day].forEach((p, i) => {
            // Global Next Logic: Connect nodes bridging across different day groups visually
            const hasNextInDay = i < groupedPlaces[day].length - 1;
            const hasNextDay = dayIndex < dayKeys.length - 1;
            const hasNextGlobally = hasNextInDay || hasNextDay;
            
            // If it crosses a day group, stretch the connecting line under the badge
            const trackBottomClass = hasNextInDay ? '-bottom-[30px]' : '-bottom-[110px]';
            const isCancelled = p.cancelStatus && p.cancelStatus.toLowerCase().includes("cancel");

            // Format dynamic contextual tag badge for transport or hotel
            let badgeHtml = "";
            let detailText = p.details ? p.details.toLowerCase() : "";
            
            if (detailText.includes("train") || detailText.includes("exp")) {
              badgeHtml = `<span class="bg-amber-100 text-amber-700 text-[9px] font-bold px-2 py-1 rounded uppercase tracking-wider inline-block"> ${p.details}</span>`;
            } else if (detailText.includes("hotel") || detailText.includes("stay")) {
              badgeHtml = `<span class="bg-emerald-100 text-emerald-700 text-[9px] font-bold px-2 py-1 rounded uppercase tracking-wider inline-block"> ${p.details}</span>`;
            } else if (detailText.includes("visit") || p.details) {
              badgeHtml = `<span class="bg-indigo-100 text-indigo-700 text-[9px] font-bold px-2 py-1 rounded uppercase tracking-wider inline-block"> ${p.details}</span>`;
            }

            // Timeline styling resets per node
            let timeBlock = "";
            let dotClass = "bg-indigo-500";
            let cardClass = "ml-6 p-3.5 rounded-xl border shadow-sm transition-all";
            let titleClass = "font-bold text-sm";
            let clickAction = "";
            
            // Determine active/cancelled/arrived state
            if (isCancelled) {
              timeBlock = `<p class="text-[11px] font-black italic text-red-500 mt-1">Cancelled</p>`;
              dotClass = "bg-slate-300"; 
              cardClass += " bg-red-50 border-red-200 opacity-60"; 
              titleClass += " text-red-800 line-through decoration-red-400"; 
            } else {
              if (p.eta) timeBlock += `<p class="text-[9px] font-bold text-slate-400">ETA ${p.eta}</p>`;
              if (p.ata) timeBlock += `<p class="text-[11px] font-black text-indigo-600 mt-0.5">ATA ${p.ata}</p>`;
              cardClass += " bg-white border-slate-200 active:scale-95 cursor-pointer hover:border-indigo-200";
              titleClass += " text-slate-800";
              clickAction = `onclick="recordLiveATA(${p.rowId})"`; // Register tap
            }

            animStep++; 
            // Flattened the curve so the entire timeline loads almost instantly
            let nodeDelay = badgeDelay + 10; 
            let cardDelay = nodeDelay + 15; 

            // Create node HTML structure (Time, Dot, Connecting Line segment, Card payload)
            scheduleHtml += `
                <div class="relative w-full tracker-node" data-rowid="${p.rowId}" data-eta="${p.eta || ''}" data-ata="${p.ata || ''}" data-cancelled="${isCancelled}">
                  
                  ${hasNextGlobally ? `
                  <div class="absolute -left-[2px] top-5 ${trackBottomClass} w-[2px] bg-slate-200 z-0">
                    <div id="live-fill-${p.rowId}" class="w-full bg-indigo-500 transition-all duration-1000 ease-out relative flex justify-center z-10" style="height: 0%;">
                      <span id="live-dot-${p.rowId}" class="absolute -bottom-1 flex h-2.5 w-2.5 hidden z-20">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-indigo-400"></span>
                        <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500 shadow-[0_0_6px_rgba(99,102,241,0.8)]"></span>
                      </span>
                    </div>
                  </div>
                  ` : ''}

                  <div id="time-block-${p.rowId}" class="absolute -left-[84px] top-0 text-right w-16 anim-card" style="animation-delay: ${cardDelay}ms;">
                    ${timeBlock}
                  </div>
                  <div class="absolute -left-[9px] top-1.5 w-4 h-4 ${dotClass} rounded-full border-4 border-slate-50 shadow-sm anim-node z-20" style="animation-delay: ${nodeDelay}ms;"></div>
                  <div ${clickAction} class="${cardClass} anim-card relative z-10" style="animation-delay: ${cardDelay}ms;">
                    <p class="${titleClass}">${p.location || "Location TBD"}</p>
                    ${badgeHtml ? `<div class="mt-2.5 ${isCancelled ? 'opacity-70 grayscale' : ''}">${badgeHtml}</div>` : ''}
                  </div>
                </div>`;
          });

          scheduleHtml += `</div></div>`;
        });
        
        scheduleHtml += `</div>`;
      }

      document.getElementById('ui-timeline-container').innerHTML = scheduleHtml;


      
      
      // FIRE THE LIVE TRACKING ENGINE calculations
      if(window.liveTimelineInterval) clearInterval(window.liveTimelineInterval);
      window.liveTimelineInterval = setInterval(updateLiveTimelineEngine, 30000); 
      setTimeout(updateLiveTimelineEngine, 100); 
      
      // Attempt to hide splash screen
      const splash = document.getElementById('app-splash-screen'); if (splash) { splash.classList.add('opacity-0'); setTimeout(() => splash.classList.add('hidden'), 500); } 
      
      // LIVE ID PATCH: Re-render ID card data dynamically if modal is open during data refresh
      const eidModal = document.getElementById('eid-modal');
      if (eidModal && !eidModal.classList.contains('hidden')) {
        refreshEIDCardData();
      }
      
      // --- POPULATE ARCHIVES MODAL DATA ---
renderArchivesList(data.pastTrips);
      attemptSplashHide();
   }
    
    // ==========================================
    // EXPENSE SUBMISSION EVENT LISTENER
    // ==========================================
    document.getElementById('expenseForm').addEventListener('submit', function(e) { 
      e.preventDefault(); 
      
      // Convert Swiper text into loading spinner
      const swipeText = document.getElementById('swipe-text');
      if (swipeText) {
        swipeText.innerHTML = '<div class="loader w-4 h-4 border-4 rounded-full mx-auto border-t-white border-slate-600"></div>';
        swipeText.style.opacity = '1';
      }

      // Format ISO Date for backend
      // Format exact Real-Time Timestamp with proper timezone
      const pickedDateStr = this.date.value;
      const now = new Date();
      let finalDateTimeIso = now.toISOString();

      if (pickedDateStr) {
        const [year, month, day] = pickedDateStr.split('-').map(Number);
        const expenseDate = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
        finalDateTimeIso = expenseDate.toISOString();
      }
      
      // Set active claimant context
      const activeClaimant = localStorage.getItem('trekLoggedInUser') || "Unknown";

      const formData = { 
        amount: this.amount.value, 
        category: this.category.value, 
        date: finalDateTimeIso, 
        notes: this.notes.value,
        paidVia: document.querySelector('select[name="paidVia"]').value, 
        claimant: activeClaimant
      }; 

      const localFormAmountBackup = parseFloat(formData.amount) || 0; const localFormNotesBackup = formData.notes.trim();
      
      // Submit via AJAX to Google Script
      apiRequest('expense', formData)
       .then((d) => {
         renderApp(d);
         document.getElementById('expenseForm').reset();
         document.getElementById('todayDate').valueAsDate = new Date();
         resetSwipeState();
         triggerBudgetPeekConfirmationFlip(localFormAmountBackup, localFormNotesBackup);
       })
       .catch((error) => {
         console.error(error);
         const swipeText = document.getElementById('swipe-text');
         if (swipeText) {
           swipeText.innerText = "FAILED - CHECK NETWORK";
           swipeText.classList.replace('text-slate-400', 'text-rose-500');
         }
         setTimeout(resetSwipeState, 3000);
       }); 
    });

    

    // ==========================================
    // SWIPE-TO-LOG PHYSICS ENGINE
    // Simulates iOS "Slide to Unlock" behavior
    // ==========================================
    const swipeTrack = document.getElementById('swipe-track');
    const swipeThumb = document.getElementById('swipe-thumb');
    const swipeText = document.getElementById('swipe-text');
    
    let isSwiping = false;
    let startX = 0;
    let currentTranslate = 0;
    
    // Calculates the absolute max X pixel movement before hitting the right side
    function getMaxTranslate() {
      return swipeTrack.offsetWidth - swipeThumb.offsetWidth - 12; // 12px padding constraint
    }

    // Attach tracking
    function startSwipe(e) {
      if (!swipeTrack || !swipeThumb) return;
      isSwiping = true;
      startX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
      swipeThumb.style.transition = 'none'; 
    }

    // Track movement smoothly across axis
    function onSwipe(e) {
      if (!isSwiping) return;
      const currentX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
      let deltaX = currentX - startX;
      const maxTranslate = getMaxTranslate();

      // Enforce physical boundaries
      if (deltaX < 0) deltaX = 0;
      if (deltaX > maxTranslate) deltaX = maxTranslate;

      currentTranslate = deltaX;
      swipeThumb.style.transform = `translateX(${currentTranslate}px)`;
      // Fade out text as thumb slides over it
      swipeText.style.opacity = 1 - (currentTranslate / (maxTranslate * 0.7));
    }

    // Capture release event
    function endSwipe() {
      if (!isSwiping) return;
      isSwiping = false;
      const maxTranslate = getMaxTranslate();
      swipeThumb.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)';

      // Trigger Save if thumb crosses the 80% mark threshold
      if (currentTranslate > maxTranslate * 0.8) {
        
        // Form Validation Interceptor (Blocks submission if empty)
        const form = document.getElementById('expenseForm');
        if (!form.checkValidity()) {
          form.reportValidity(); 
          resetSwipeState();     
          return;                
        }

        // Lock thumb to far right and turn green
        swipeThumb.style.transform = `translateX(${maxTranslate}px)`;
        swipeText.innerText = "SAVING...";
        swipeText.style.opacity = 1;
        swipeText.classList.replace('text-slate-400', 'text-emerald-400');
        
        // Fire the hidden standard submit button
        const hiddenSubmit = document.getElementById('hidden-submit-btn');
        if (hiddenSubmit) hiddenSubmit.click();
      } else {
        // Failed constraint, visually snap back to starting state
        resetSwipeState();
      }
    }

    // Resets the slider UI back to origin state
    function resetSwipeState() {
      currentTranslate = 0;
      if (swipeThumb) swipeThumb.style.transform = `translateX(0px)`;
      if (swipeText) {
        swipeText.innerText = "SWIPE TO SAVE";
        swipeText.classList.replace('text-emerald-400', 'text-slate-400');
        swipeText.style.opacity = 1;
      }
    }

    // Event binding for both touch and mouse interfaces
    if (swipeThumb && swipeTrack) {
      swipeThumb.addEventListener('mousedown', startSwipe);
      document.addEventListener('mousemove', onSwipe);
      document.addEventListener('mouseup', endSwipe);

      swipeThumb.addEventListener('touchstart', startSwipe, {passive: true});
      document.addEventListener('touchmove', onSwipe, {passive: false});
      document.addEventListener('touchend', endSwipe);
    }
    
    // ==========================================
    // REAL-TIME GPS TRANSIT POSITIONING ENGINE
    // Controls the vertical sliding progress line on the Route tab
    // ==========================================

    // Parses string time ("2:30 PM") into workable JS Date objects for today
    function parseTimeStrToday(timeStr) {
        if (!timeStr) return null;
        const now = new Date();
        let match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (match) {
            let hours = parseInt(match[1]);
            let mins = parseInt(match[2]);
            if (match[3].toUpperCase() === 'PM' && hours < 12) hours += 12;
            if (match[3].toUpperCase() === 'AM' && hours === 12) hours = 0;
            return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, mins, 0).getTime();
        }
        return now.getTime();
    }

    // Updates the DOM elements to slide the dot down the timeline track
    function positionLiveMarker(startRowId, endRowId, progressPct) {
       const wrap = document.getElementById('master-timeline-wrap');
       const trackFill = document.getElementById('live-track-fill');
       const trainDot = document.getElementById('live-train-dot');
       const startNode = document.getElementById(`timeline-dot-${startRowId}`);
       const endNode = endRowId ? document.getElementById(`timeline-dot-${endRowId}`) : null;

       if (!wrap || !trackFill || !trainDot || !startNode) return;

       // Calculate pixel dimensions
       const wrapRect = wrap.getBoundingClientRect();
       const startRect = startNode.getBoundingClientRect();
       const startY = (startRect.top - wrapRect.top) + (startRect.height / 2);
       let targetY = startY;

       // Math for calculating position based on percentage of completion between 2 nodes
       if (endNode && progressPct > 0) {
           const endRect = endNode.getBoundingClientRect();
           const endY = (endRect.top - wrapRect.top) + (endRect.height / 2);
           const distance = endY - startY;
           targetY = startY + (distance * progressPct);
       }

       // Updates inline CSS to push the dot and stretch the tracking line
       const fillHeight = Math.max(0, targetY - 24);
       trackFill.style.height = `${fillHeight}px`;
       trainDot.style.transform = `translateY(${targetY - 5}px)`;
       trainDot.style.opacity = '1';
    }

    // Sets up loop to monitor clock and slide GPS dot
    let liveGpsInterval = null;

    function startLiveGPS(payload) {
       if(liveGpsInterval) clearInterval(liveGpsInterval);

       // AFTER:
const places = payload.places.filter(p => p.tripDay || p.location);
       if(!places || places.length === 0) return;

       let lastVisitedIndex = -1;
       for (let i = 0; i < places.length; i++) {
           if (places[i].ata) lastVisitedIndex = i;
       }

       // Static rendering if finished or not started
       if (lastVisitedIndex === -1 || lastVisitedIndex === places.length - 1) {
           const snapId = lastVisitedIndex >= 0 ? places[lastVisitedIndex].rowId : places[0].rowId;
           positionLiveMarker(snapId, snapId, 0);
           return;
       }

       const startNode = places[lastVisitedIndex];
       const nextNode = places[lastVisitedIndex + 1];

       // Derive total transition time
       const startTime = parseTimeStrToday(startNode.ata || startNode.eta);
       const endTime = parseTimeStrToday(nextNode.eta);

       const updatePosition = () => {
           const now = new Date().getTime();
           let progress = 0;
           
           if (startTime && endTime && endTime > startTime) {
               progress = (now - startTime) / (endTime - startTime);
           }
           
           if (progress < 0) progress = 0;
           
           // Holding Pattern constraint: Stop dot at 92% just above the card until user manually taps "Arrive"
           if (progress >= 0.92) progress = 0.92;

           positionLiveMarker(startNode.rowId, nextNode.rowId, progress);
       };

       updatePosition(); 
       liveGpsInterval = setInterval(updatePosition, 10000); // Iterates clock check 
    }

    // ==========================================
    // ATA TAPPING / RECORDING LOGIC
    // ==========================================
    function recordLiveATA(rowId) {
      const timeBlock = document.getElementById(`time-block-${rowId}`);
      const node = document.querySelector(`.tracker-node[data-rowid="${rowId}"]`);
      
      // Blocks double-firing if already stamped
      if (!timeBlock || !node || timeBlock.innerHTML.includes('ATA')) return;

      // Swap hollow dot for solid active fill dot
      const targetNode = document.getElementById(`timeline-dot-${rowId}`);
      if (targetNode) {
          targetNode.className = "absolute -left-[9px] top-1.5 w-4 h-4 bg-indigo-500 border-4 border-slate-50 rounded-full shadow-sm anim-node z-20";
      }

      // Generate precise timestamp array string
      const now = new Date();
      const instantAta = new Intl.DateTimeFormat('en-GB', { 
  hour: '2-digit', 
  minute: '2-digit', 
  hour12: false, 
  timeZone: 'Asia/Kolkata' 
}).format(now);

      // Drop in the new visual timestamp with 3-second blinking FX
      timeBlock.innerHTML += `<p class="text-[11px] font-black text-indigo-600 mt-0.5 animate-blink-3">ATA ${instantAta}</p>`;

      // Modifies the local element payload
      node.setAttribute('data-ata', instantAta);
      if (typeof updateLiveTimelineEngine === 'function') {
          updateLiveTimelineEngine();
      }

      if (typeof positionLiveMarker === 'function') {
          positionLiveMarker(rowId, rowId, 0);
      }

      // Asynchronously post to Google Sheet without blocking the UI
      apiRequest('ata', { rowId })
        .then((freshData) => {
          globalActiveDataPayloadBackup = freshData;
          if (typeof startLiveGPS === 'function') {
              startLiveGPS(freshData);
          }
        })
        .catch(error => {
          console.error(error);
          showToast("Unable to stamp arrival time.");
        });
    }

    // ==========================================
    // LEDGER / LIST VIEW TOGGLE ENGINE
    // ==========================================
    let isLedgerActive = false;
    
    function toggleLedger() {
      isLedgerActive = !isLedgerActive;
      
      const topCards = document.getElementById('ui-top-cards-wrapper');
      const formWrap = document.getElementById('ui-form-wrapper');
      const ledgerBox = document.getElementById('ui-ledger-container');

      if (isLedgerActive) {
        // Expand the ledger
        renderLedgerList();

        // Compress and hide standard Spend UI layout
        topCards.classList.add('hidden');
        formWrap.classList.add('hidden');
        
        // Show and animate ledger entrance
        ledgerBox.classList.remove('hidden');
        setTimeout(() => {
          ledgerBox.classList.remove('opacity-0', 'translate-y-10');
        }, 50);

      } else {
        // Hide ledger and animate exit
        ledgerBox.classList.add('opacity-0', 'translate-y-10');
        setTimeout(() => { ledgerBox.classList.add('hidden'); }, 300);

        // Bring back standard Spend UI elements
        topCards.classList.remove('hidden');
        formWrap.classList.remove('hidden');
        
        topCards.style.maxHeight = '300px';
        topCards.style.opacity = '1';
        formWrap.style.maxHeight = '500px';
        formWrap.style.opacity = '1';
      }
      
      lucide.createIcons();
    }

    // ==========================================
    // HTML5 CANVAS SIGNATURE CAPTURE ENGINE
    // ==========================================
    let currentSigningMember = "";
    let sigCanvas = null, sigCtx = null, isDrawingSig = false;

    function openSignaturePad(memberName) {
      currentSigningMember = memberName;
      const modal = document.getElementById('signature-modal');
      modal.classList.remove('hidden');
      document.body.classList.add('overflow-hidden', 'touch-none'); // Prevent scrolling while drawing
      
      // Setup canvas bounds and styles
      sigCanvas = document.getElementById('sig-canvas');
      sigCtx = sigCanvas.getContext('2d');
      sigCanvas.width = sigCanvas.offsetWidth;
      sigCanvas.height = sigCanvas.offsetHeight;
      sigCtx.lineWidth = 3;
      sigCtx.lineCap = 'round';
      sigCtx.strokeStyle = '#0f172a'; // Dark slate ink
      sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
      
      // Calculate accurate pointer offsets
      const getPos = (e) => {
        const rect = sigCanvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
      };

      // Draw Path functions
      const startDraw = (e) => { e.preventDefault(); isDrawingSig = true; const pos = getPos(e); sigCtx.beginPath(); sigCtx.moveTo(pos.x, pos.y); };
      const draw = (e) => { if (!isDrawingSig) return; e.preventDefault(); const pos = getPos(e); sigCtx.lineTo(pos.x, pos.y); sigCtx.stroke(); };
      const stopDraw = () => { isDrawingSig = false; sigCtx.closePath(); };

      // Attach event listeners for mouse and touch interactions
      sigCanvas.addEventListener('mousedown', startDraw); sigCanvas.addEventListener('mousemove', draw);
      sigCanvas.addEventListener('mouseup', stopDraw); sigCanvas.addEventListener('mouseout', stopDraw);
      sigCanvas.addEventListener('touchstart', startDraw, {passive: false}); sigCanvas.addEventListener('touchmove', draw, {passive: false});
      sigCanvas.addEventListener('touchend', stopDraw);
    }

    function closeSignaturePad() {
      document.getElementById('signature-modal').classList.add('hidden');
      document.body.classList.remove('overflow-hidden', 'touch-none');
    }

    // Submits drawing path base64 payload to backend
    function submitSignature() {
      if (!currentSigningMember) return;
      const btn = document.getElementById('sig-submit-btn');
      btn.innerHTML = '<div class="w-5 h-5 border-4 border-t-white border-slate-500 rounded-full animate-spin mx-auto"></div>';
      
      // Convert to image string
      const base64Data = sigCanvas.toDataURL('image/png');
      
      apiRequest('signature', { memberPin: currentSigningMember, base64Data })
        .then((d) => {
          closeSignaturePad();
          btn.innerHTML = 'Submit Signature';
          renderApp(d);
        })
        .catch(error => {
          console.error(error);
          btn.innerHTML = 'Submit Signature';
          showToast("Unable to save signature.");
        });
    }

    // ==========================================
    // AUTHENTICATION LOGIC (Login/Logout)
    // ==========================================
    function processAppLogin() {
      const selectedName = document.getElementById('login-name-select').value;
      const typedPin = document.getElementById('login-pin-input').value;
      const loginCard = document.getElementById('login-card');
      const errorMsg = document.getElementById('login-error-msg');
      const btn = document.getElementById('login-submit-btn');
      
      // Validate length before trying server
      if (!typedPin || typedPin.length < 4) { triggerLoginError(); return; }
      
      btn.innerHTML = '<div class="w-5 h-5 border-4 border-t-white border-slate-500 rounded-full animate-spin mx-auto"></div>';
      errorMsg.classList.add('hidden');
      
      // Send to the Vercel API to evaluate against the Supabase member PIN DB
      apiRequest('login', { name: selectedName, pin: typedPin })
        .then((result) => {
          if (result.success) {
            localStorage.setItem('trekLoggedInUser', result.name);
            localStorage.setItem('trekLoggedInPIN', typedPin);
            document.getElementById('login-overlay').classList.add('hidden');

            const splash = document.getElementById('app-splash-screen');
            if (splash) {
              splash.classList.remove('hidden', 'opacity-0');
              document.getElementById('splash-micro-text').innerText = "Decrypting squad ledger...";
            }

            fetchInitialData();
            document.getElementById('app-splash-screen').classList.remove('hidden', 'opacity-0');
            runSplashSequence();
          } else {
            btn.innerText = "Unlock App";
            triggerLoginError();
          }
        })
        .catch(error => {
          console.error(error);
          btn.innerText = "Unlock App";
          triggerLoginError();
        });
    }

    // UX function to visually shake the login modal on failure
    function triggerLoginError() {
      const loginCard = document.getElementById('login-card');
      const errorMsg = document.getElementById('login-error-msg');
      const pinInput = document.getElementById('login-pin-input');
      
      errorMsg.classList.remove('hidden');
      pinInput.value = ""; // Clear input immediately
      loginCard.classList.add('animate-shake'); // Shake CSS class
      setTimeout(() => { loginCard.classList.remove('animate-shake'); }, 400);
    }

    // ==========================================
    // BOTTOM SHEET MENU BEHAVIORS ("More" Tab)
    // ==========================================
    function toggleMoreMenu() {
      const overlay = document.getElementById('more-menu-overlay');
      const sheet = document.getElementById('more-menu-sheet');
      
      if (overlay.classList.contains('hidden')) {
        // Inject current user name dynamically
        const loggedUser = localStorage.getItem('trekLoggedInUser') || "Squad Member";
        document.getElementById('ui-more-username').innerText = loggedUser;

        overlay.classList.remove('hidden');
        lucide.createIcons(); 
        
        // Timeout necessary to trigger CSS transition off hidden state
        setTimeout(() => { sheet.classList.remove('translate-y-full'); }, 10);
      } else {
        sheet.classList.add('translate-y-full');
        setTimeout(() => { overlay.classList.add('hidden'); }, 300);
      }
    }
    
    // Purges local storage tokens and kicks back to login screen
    function processLogOut() {
      toggleMoreMenu(); 
      
      localStorage.removeItem('trekLoggedInUser'); 
      localStorage.removeItem('trekLoggedInPIN'); 
      
      const pinInput = document.getElementById('login-pin-input');
      if (pinInput) pinInput.value = "";
      
      const loginBtn = document.getElementById('login-submit-btn');
      if (loginBtn) loginBtn.innerText = "Sign In";

      // Re-map the active members for the dropdown menu
      const selectDropdown = document.getElementById('login-name-select');
      if (selectDropdown && cachedMembersList && cachedMembersList.length > 0) {
        selectDropdown.innerHTML = cachedMembersList.map(m => `<option value="${m.name}">${m.name}</option>`).join('');
      }
      
      document.getElementById('login-overlay').classList.remove('hidden');
    }

    // ==========================================
    // E-ID CARD LOGIC
    // Displays the modal and maps all data
    // ==========================================
    function openEID() {
      document.getElementById('eid-modal').classList.remove('hidden');

      const curtain = document.getElementById('eid-scan-curtain');
      const qrScanner = document.getElementById('eid-qr-scanner');

      // Strip existing animation hooks
      curtain.classList.remove('anim-scanner-curtain');
      if(qrScanner) qrScanner.classList.remove('anim-scanner-qr');
      
      // Force Reflow - critical to restarting the animation timings cleanly
      void curtain.offsetWidth;
      if(qrScanner) void qrScanner.offsetWidth;

      // Add back the hook class (Animations trigger from CSS config delay)
      curtain.classList.add('anim-scanner-curtain');
      if(qrScanner) qrScanner.classList.add('anim-scanner-qr');

      // Data is populated independently of the curtain animation
      refreshEIDCardData();
    }

    // Maps the global API payload to the DOM targets inside the ID Card
    function refreshEIDCardData() {
      if (!globalActiveDataPayloadBackup) return;

      const pin = localStorage.getItem('trekLoggedInPIN');
      const member = globalActiveDataPayloadBackup.members.find(m => String(m.pin).trim() === String(pin).trim());
      if (!member) return;

      // Text Injections
      document.getElementById('eid-title').innerText = globalActiveDataPayloadBackup.eidHeading || globalActiveDataPayloadBackup.tripName || 'VALLEY OF FLOWERS';
      
      const subtitleEl = document.getElementById('eid-subtitle');
      if (globalActiveDataPayloadBackup.eidSubheading && globalActiveDataPayloadBackup.eidSubheading.trim() !== "") {
        subtitleEl.innerText = globalActiveDataPayloadBackup.eidSubheading;
        subtitleEl.classList.remove('hidden');
      } else {
        subtitleEl.classList.add('hidden');
      }
      
      document.getElementById('eid-photo').src = member.img || '';
      document.getElementById('eid-name').innerText = member.name;
      document.getElementById('eid-designation').innerText = member.designation || '-';
      document.getElementById('eid-role').innerText = member.memberRole || '-';
      document.getElementById('eid-mobile').innerText = member.mobile || '-';
      document.getElementById('eid-email').innerText = member.email || '-';
      document.getElementById('eid-chief-sign').src = globalActiveDataPayloadBackup.chiefCoordinatorSignature || '';

      // Dynamic Color Theme Switching (Indigo = Verified, Rose/Red = Unverified)
      const leftBar = document.getElementById('eid-left-bar');
      const photoBorder = document.getElementById('eid-photo-container');
      const titleText = document.getElementById('eid-title');
      const signText = document.getElementById('eid-sign-text');
      const verticalStatusText = document.getElementById('eid-vertical-status');
      
      const status = String(member.verification || '').toLowerCase().trim();
      const isVerified = status === 'verified';

      if (isVerified) {
        verticalStatusText.innerText = "VERIFIED";
        leftBar.className = "w-[52px] bg-indigo-600 flex flex-col justify-between items-center py-4 text-white shrink-0 transition-colors duration-500 select-none overflow-hidden";
        photoBorder.className = "h-[185px] w-full border-y-[3px] border-indigo-600 relative bg-slate-100 overflow-hidden transition-colors duration-500";
        titleText.className = "text-[16px] font-black tracking-tight uppercase text-indigo-700 leading-tight w-full truncate transition-colors duration-500";
        signText.className = "text-[7px] font-black uppercase tracking-widest text-indigo-700 border-t border-slate-300 pt-0.5 w-[85%] transition-colors duration-500";
      } else {
        verticalStatusText.innerText = "UNVERIFIED";
        leftBar.className = "w-[52px] bg-rose-600 flex flex-col justify-between items-center py-4 text-white shrink-0 transition-colors duration-500 select-none overflow-hidden";
        photoBorder.className = "h-[185px] w-full border-y-[3px] border-rose-600 relative bg-slate-100 overflow-hidden transition-colors duration-500";
        titleText.className = "text-[16px] font-black tracking-tight uppercase text-rose-700 leading-tight w-full truncate transition-colors duration-500";
        signText.className = "text-[7px] font-black uppercase tracking-widest text-rose-700 border-t border-slate-300 pt-0.5 w-[85%] transition-colors duration-500";
      }

      // Stamp Image
      const stampImageUrl = globalActiveDataPayloadBackup.eidStampImage;
      const stampContainer = document.getElementById('eid-stamp-container');
      const stampImgEl = document.getElementById('eid-stamp-img');

      if (stampImageUrl && stampImageUrl !== "") {
        stampImgEl.src = stampImageUrl;
        stampContainer.classList.remove('hidden');
      } else {
        stampContainer.classList.add('hidden');
        stampImgEl.src = "";
      }

      buildQR(member);
      lucide.createIcons();
    }

    function buildQR(member) {
      const qr = document.getElementById('eid-qr');
      qr.innerHTML = '';
      const isVerified = String(member.verification || '').toLowerCase().trim() === 'verified';
      const statusText = isVerified ? 'VERIFIED' : 'UNVERIFIED';
      const securePayload = `${member.name} | ${member.designation || 'Member'} | STATUS: ${statusText}`;

      new QRCode(qr, {
        text: securePayload,
        width: 62,
        height: 62,
        colorDark: "#0f172a",
        colorLight: "#ffffff"
      });
    }

    // Fills out verification sub-status
    function renderVerification(member) {
      const box = document.getElementById('eid-status');
      const status = (member.verification || '').toLowerCase();

      if (status.includes('verified')) {
        box.innerHTML = `
        <span class="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-full flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest shadow-sm border border-indigo-100">
          <i data-lucide="check-circle-2" class="w-3.5 h-3.5 stroke-[2.5]"></i> VERIFIED
        </span>`;
      } else {
        box.innerHTML = `
        <span class="bg-rose-50 text-rose-600 px-3 py-1.5 rounded-full flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest shadow-sm border border-rose-100">
          <i data-lucide="shield-alert" class="w-3.5 h-3.5 stroke-[2.5]"></i> UNVERIFIED
        </span>`;
      }
    }
    
    // Close modal function (applies fade timing)
    function closeEID() {
      const modal = document.getElementById('eid-modal');
      if (modal) {
        modal.classList.add('opacity-0');
        setTimeout(() => {
          modal.classList.add('hidden');
          modal.classList.remove('opacity-0');
        }, 300); 
      }
    }

    

    // ==========================================
    // SECONDARY / IMPROVED TIMELINE LINE RENDERING 
    // Parses nodes and calculates pixel heights dynamically for progress fill
    // ==========================================
    function updateLiveTimelineEngine() {
        const nodesArray = Array.from(document.querySelectorAll('.tracker-node'));
        if(nodesArray.length === 0) return;

        const now = new Date().getTime();

        // Safe css transition height manipulator
        function setHeightSmooth(el, newPct) {
            if (el.style.height === '0%' || el.style.height === '') {
                el.style.transition = 'none'; // Temporarily disable animation
                el.style.height = newPct;     
                void el.offsetHeight;         // Reflow
                el.style.transition = '';     // Restore
            } else {
                el.style.height = newPct;     // Animate normal
            }
        }

        nodesArray.forEach((node, index) => {
            const rowId = node.getAttribute('data-rowid');
            const currentEta = node.getAttribute('data-eta');
            const currentAta = node.getAttribute('data-ata');
            const isCancelled = node.getAttribute('data-cancelled') === 'true';
            
            const fillEl = document.getElementById(`live-fill-${rowId}`);
            const dotEl = document.getElementById(`live-dot-${rowId}`);
            
            if(!fillEl) return; 

            // Find the next available non-cancelled node to measure against
            let nextValidNode = null;
            for(let j = index + 1; j < nodesArray.length; j++) {
                if(nodesArray[j].getAttribute('data-cancelled') !== 'true') {
                    nextValidNode = nodesArray[j];
                    break;
                }
            }

            // UI adjustments for node conditions
            if(isCancelled) {
                setHeightSmooth(fillEl, '100%');
                fillEl.classList.replace('bg-indigo-500', 'bg-slate-300'); // Grey out
                if(dotEl) dotEl.classList.add('hidden');
                return;
            }

            if(!currentAta || currentAta.trim() === "") {
                setHeightSmooth(fillEl, '0%'); // Not started
                if(dotEl) dotEl.classList.add('hidden');
                return;
            }

            // It has ATA. Where do we put the line?
            const nextAta = nextValidNode ? nextValidNode.getAttribute('data-ata') : null;
            if(nextAta && nextAta.trim() !== "") {
                // Next node is already reached. Set line to 100% solid
                setHeightSmooth(fillEl, '100%');
                if(dotEl) dotEl.classList.add('hidden');
                return;
            }

            // Core tracker arithmetic based on node intervals
            const nextEta = nextValidNode ? nextValidNode.getAttribute('data-eta') : null;
            const startTimestamp = parseTimelineTime(currentAta); 
            const expectedStart = parseTimelineTime(currentEta);
            let expectedEnd = parseTimelineTime(nextEta);

            let scheduledDuration = 3600000; // default 1hr fallback
            if(expectedStart && expectedEnd) {
                if(expectedEnd < expectedStart) expectedEnd += 86400000; // Account for Midnight boundary crossover
                scheduledDuration = expectedEnd - expectedStart;
            }

            const projectedArrival = startTimestamp + scheduledDuration;
            
            if (now < startTimestamp) {
                setHeightSmooth(fillEl, '0%');
                if(dotEl) dotEl.classList.add('hidden');
            } else {
                const elapsed = now - startTimestamp;
                let pct = (elapsed / scheduledDuration) * 100;
                
                // Do not allow the tracking line to overlap the next node UI completely
                if(pct > 85) pct = 85; 
                
                setHeightSmooth(fillEl, `${pct}%`);
                if(dotEl) dotEl.classList.remove('hidden');
            }
        });
    }
    
    // Fallback simple Time Parser for timeline
    function parseTimelineTime(timeStr) {
        if(!timeStr || timeStr.trim() === "") return null;
        const match = timeStr.trim().match(/(\d{1,2}):(\d{2})/);
        if(!match) return null;
        const hours = parseInt(match[1], 10);
        const mins = parseInt(match[2], 10);
        
        const target = new Date();
        target.setHours(hours, mins, 0, 0);
        return target.getTime();
    }

    // ==========================================
    // LEDGER FILTER ENGINE (Tags like "Food", "Travel")
    // ==========================================
    function toggleLedgerFilter() {
      const bar = document.getElementById('ledger-filter-bar');
      if (bar.classList.contains('hidden')) {
        bar.classList.remove('hidden');
        renderFilterChips();
      } else {
        bar.classList.add('hidden');
        if(currentLedgerFilter !== "All") {
           currentLedgerFilter = "All"; // Clear filter logic on menu close
           renderLedgerList();
        }
      }
    }

    // Injects html pills for categories
    function renderFilterChips() {
      const categories = ["All", "Food", "Stay", "Fare", "Entry Fee", "Water", "Other"];
      const bar = document.getElementById('ledger-filter-bar');
      
      bar.innerHTML = categories.map(cat => {
        const isActive = cat === currentLedgerFilter;
        // Sets purple active state block
        const bgClass = isActive 
          ? "bg-indigo-600 text-white shadow-md scale-105 border-transparent" 
          : "bg-white text-slate-500 border-slate-200 active:scale-95 hover:bg-slate-50";
          
        return `<button onclick="applyLedgerFilter('${cat}')" class="px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider flex-shrink-0 snap-start transition-all border ${bgClass}">${cat}</button>`;
      }).join('');
    }

    function applyLedgerFilter(category) {
      currentLedgerFilter = category.trim(); 
      renderFilterChips(); // Update ui buttons
      renderLedgerList();  // Re-run ledger output loop
    }

    // ==========================================
    // GLOBAL LEDGER ENGINE & LAZY LOADING
    // ==========================================
    
    let visibleLedgerCount = 15; // Set starting chunk limit

    function loadMoreLedger() {
      visibleLedgerCount += 15; // Extends DOM slice
      renderLedgerList();
    }

    // Loops over the cached local array backup and renders transaction tickets
    function renderLedgerList() {
      const listContainer = document.getElementById('txList');
      if (!listContainer || !globalLedgerDataBackup) return;
      
      // Strip items not matching the pill filter
      const filteredData = currentLedgerFilter === "All" 
        ? globalLedgerDataBackup 
        : globalLedgerDataBackup.filter(t => String(t.category).trim() === currentLedgerFilter);

      // Handle null state
      if (filteredData.length === 0) {
        listContainer.innerHTML = `
          <div class="w-full py-8 text-center animate-pulse">
            <i data-lucide="receipt-indian-rupee" class="w-8 h-8 text-slate-200 mx-auto mb-2"></i>
            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No expenses found</p>
          </div>`;
        lucide.createIcons();
        return;
      }

      // Chunk array against our lazy loader var limit
      const itemsToRender = filteredData.slice(0, visibleLedgerCount);

      // DOM Generator Loop
      let htmlOutput = itemsToRender.map(t => { 
        let dateTimeString = "";
        if (t.date) { 
          try { 
            const txDate = new Date(t.date); 
            const datePart = new Intl.DateTimeFormat('en-IN', { 
              day: 'numeric', 
              month: 'short', 
              timeZone: 'Asia/Kolkata' 
            }).format(txDate); 
            const timePart = new Intl.DateTimeFormat('en-IN', { 
              hour: 'numeric', 
              minute: '2-digit', 
              hour12: true, 
              timeZone: 'Asia/Kolkata' 
            }).format(txDate); 
            dateTimeString = `${datePart}, ${timePart}`; 
          } catch(e) { dateTimeString = t.date; } 
        }
        
        // Setup overbudget logic coloring
        const txCardBg = t.overBudget ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-100';
        const amountColor = t.overBudget ? 'text-rose-600' : 'text-slate-900';

        // Sanitizing inputs before outputting inside HTML onClick triggers
        const safeNotes = String(t.notes || 'Expense').replace(/['"`]/g, '').replace(/[\n\r]/g, ' ');
        const safeCat = String(t.category || 'Other').replace(/['"`]/g, '').replace(/[\n\r]/g, ' ');
        const safeUtr = t.utr && t.utr !== 'undefined' ? String(t.utr).replace(/['"`]/g, '') : 'N/A';

        const opacityClass = t.isVerified ? "opacity-100" : "opacity-60"; 
        
        // Inline layout for verified vs unverified small tags
        const statusUI = t.isVerified 
          ? `<div class="flex items-center justify-end gap-1 text-[8px] font-black text-emerald-500 uppercase tracking-widest mt-1 whitespace-nowrap"><i data-lucide="badge-check" class="w-3 h-3"></i> Verified</div>`
          : `<div class="flex items-center justify-end gap-1 text-[8px] font-black text-amber-500 uppercase tracking-widest mt-1 whitespace-nowrap"><i data-lucide="badge-x" class="w-3 h-3"></i> Unverified</div>`;

        return `
          <div onclick="openReceiptModal('${safeUtr}', ${t.amount}, '${safeCat}', '${safeNotes}', '${dateTimeString}', ${t.isVerified})" class="${txCardBg} ${opacityClass} p-4 rounded-xl flex justify-between items-center border shadow-sm transition-colors duration-300 cursor-pointer hover:scale-[1.02] active:scale-95 overflow-hidden">
            
            <div class="flex flex-col pointer-events-none min-w-0 pr-2">
              <span class="text-[9px] font-bold text-indigo-500 uppercase tracking-wide truncate">${safeCat}</span>
              <span class="text-sm font-bold text-slate-800 mt-0.5 break-words whitespace-normal leading-snug">${safeNotes}</span>
              <span class="text-[9px] text-slate-400 font-semibold mt-1 uppercase tracking-tight truncate">${dateTimeString}</span>
            </div>

            <div class="flex flex-col items-end pointer-events-none shrink-0 ml-2">
              <span class="text-base font-black ${amountColor}">${formatINR(t.amount)}</span>
              ${statusUI}
            </div>
            
          </div>`; 
      }).join('');
      
      // Inject "Load More" button at bottom of stack if there is remainder
      if (filteredData.length > visibleLedgerCount) {
        htmlOutput += `
          <button onclick="loadMoreLedger()" class="w-full py-4 mt-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black rounded-xl text-[10px] uppercase tracking-widest transition-colors active:scale-95 border border-slate-200 shadow-sm">
            Load More Transactions
          </button>`;
      }

      listContainer.innerHTML = htmlOutput;
      lucide.createIcons();
    }
    
    // ==========================================
    // RECEIPT MODAL ENGINE
    // Fills out detailed popup when clicking a ledger item
    // ==========================================
    function openReceiptModal(utr, amount, category, notes, dateStr, isVerified) {
      if (window.receiptModalTimeout) clearTimeout(window.receiptModalTimeout);

      document.getElementById('receipt-utr').innerText = utr || "N/A";
      document.getElementById('receipt-amount').innerText = formatINR(amount || 0);
      document.getElementById('receipt-category').innerText = category || "";
      document.getElementById('receipt-notes').innerText = notes || "";
      document.getElementById('receipt-date').innerText = dateStr || "";

      // Modifies header colors
      const headBg = document.getElementById('receipt-head-bg');
      const headIcon = document.getElementById('receipt-head-icon');
      const headTitle = document.getElementById('receipt-head-title');

      if (isVerified) {
        headBg.className = "bg-blue-600 px-6 pt-10 pb-8 text-center text-white relative transition-colors duration-300";
        headTitle.className = "text-[11px] font-bold uppercase tracking-widest text-blue-100 mb-1 transition-colors duration-300";
        headTitle.innerText = "Payment Successful";
        headIcon.setAttribute('data-lucide', 'check');
        headIcon.className = "w-8 h-8 text-blue-600 stroke-[3] transition-colors duration-300";
      } else {
        headBg.className = "bg-amber-500 px-6 pt-10 pb-8 text-center text-white relative transition-colors duration-300";
        headTitle.className = "text-[11px] font-bold uppercase tracking-widest text-amber-100 mb-1 transition-colors duration-300";
        headTitle.innerText = "Payment Standby";
        headIcon.setAttribute('data-lucide', 'alert-circle');
        headIcon.className = "w-8 h-8 text-amber-500 stroke-[3] transition-colors duration-300";
      }

      // Set middle verification block style
      const badgeContainer = document.getElementById('receipt-status-badge');
      if (badgeContainer) {
        if (isVerified) {
          badgeContainer.innerHTML = `<span class="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest flex items-center gap-1"><i data-lucide="badge-check" class="w-3 h-3"></i> Verified Payment</span>`;
        } else {
          badgeContainer.innerHTML = `<span class="bg-amber-100 text-amber-700 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest flex items-center gap-1"><i data-lucide="badge-alert" class="w-3 h-3"></i> Unverified Payment</span>`;
        }
      }

      const modal = document.getElementById('receipt-modal');
      modal.classList.remove('hidden');
      modal.style.pointerEvents = 'auto'; 
      void modal.offsetHeight; // layout reset
      modal.classList.remove('opacity-0');
      document.body.classList.add('overflow-hidden'); // freeze background scrolling
      
      lucide.createIcons(); // refresh dynamic svg calls
    }

    function closeReceiptModal() {
      if (window.receiptModalTimeout) clearTimeout(window.receiptModalTimeout);

      const modal = document.getElementById('receipt-modal');
      modal.style.pointerEvents = 'none'; 
      modal.classList.add('opacity-0');

      window.receiptModalTimeout = setTimeout(() => {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
      }, 300);
    }

    // Accesses user device clipboard
    function copyUTR() {
      const utr = document.getElementById('receipt-utr').innerText;
      if (utr === "N/A" || !utr) return;
      
      navigator.clipboard.writeText(utr).then(() => {
        showToast("UTR Copied");
      }).catch(err => {
        console.error('Failed to copy text: ', err);
      });
    }

    // ==========================================
    // REUSABLE TOAST NOTIFICATION ENGINE
    // Triggers bottom pop-up message alert
    // ==========================================
    function showToast(message) {
      const toast = document.getElementById('global-toast');
      const toastMsg = document.getElementById('toast-message');
      if (!toast || !toastMsg) return;

      toastMsg.innerText = message;
      
      toast.classList.remove('opacity-0', 'translate-y-4');
      toast.classList.add('opacity-100', 'translate-y-0');

      if (window.toastTimeout) clearTimeout(window.toastTimeout);

      window.toastTimeout = setTimeout(() => {
        toast.classList.remove('opacity-100', 'translate-y-0');
        toast.classList.add('opacity-0', 'translate-y-4');
      }, 2000);
    }

    // ==========================================
    // CSV DOWNLOAD GENERATOR
    // Maps JSON local object array to string blob file
    // ==========================================
    function downloadLedgerCSV() {
      if (!globalLedgerDataBackup || globalLedgerDataBackup.length === 0) return;
      
      let csvContent = "UTR Number,Date,Time,Category,Amount,Over Budget,Notes\n";
      
      globalLedgerDataBackup.forEach(t => {
        let dateStr = "", timeStr = "";
        if (t.date) {
           try { 
             const d = new Date(t.date); 
             dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); 
             timeStr = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }); 
           } catch(e) {} 
        }
        let safeNotes = (t.notes || "Expense").replace(/,/g, " "); // Strip commas to prevent breaking column CSV syntax
        let over = t.overBudget ? "YES" : "NO";
        let safeUtr = t.utr !== 'undefined' ? t.utr : "N/A";
        
        csvContent += `${safeUtr},${dateStr},${timeStr},${t.category},${t.amount},${over},${safeNotes}\n`;
      });
      
      // Creates memory pointer link to trigger native browser file download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "Squad_Goals_Ledger.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }



    // --- REAL-TIME ARCHIVES SEARCH ENGINE ---
    function openArchivesModal() {
      toggleMoreMenu(); // Close bottom sheet menu
      
      const searchInput = document.getElementById('archive-search-input');
      if (searchInput) searchInput.value = ''; // Reset search input on open
      
      // Render full trip list when modal opens
      if (globalActiveDataPayloadBackup && globalActiveDataPayloadBackup.pastTrips) {
        renderArchivesList(globalActiveDataPayloadBackup.pastTrips);
      }

      const modal = document.getElementById('archives-modal');
      if (modal) {
        modal.classList.remove('hidden');
        lucide.createIcons();
      }
    }

    function closeArchivesModal() {
      const modal = document.getElementById('archives-modal');
      if (modal) {
        modal.classList.add('hidden');
      }
    }

    // Instant Search Filter Handler
    function filterArchivesList(searchTerm) {
      if (!globalActiveDataPayloadBackup || !globalActiveDataPayloadBackup.pastTrips) return;
      
      const term = searchTerm.toLowerCase().trim();
      const filtered = globalActiveDataPayloadBackup.pastTrips.filter(trip => {
        const nameMatch = trip.name ? trip.name.toLowerCase().includes(term) : false;
        const dateMatch = trip.dates ? trip.dates.toLowerCase().includes(term) : false;
        return nameMatch || dateMatch;
      });

      renderArchivesList(filtered);
    }

    // Separate Reusable Renderer
    function renderArchivesList(trips) {
      const container = document.getElementById('archives-modal-content');
      if (!container) return;

      if (!trips || trips.length === 0) {
        container.innerHTML = `
          <div class="bg-slate-50 rounded-2xl p-6 text-center border border-slate-200">
            <i data-lucide="search-x" class="w-8 h-8 text-slate-300 mx-auto mb-2"></i>
            <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">No matching trips found</p>
          </div>`;
        lucide.createIcons();
        return;
      }

      container.innerHTML = trips.map(trip => `
        <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col justify-between gap-3">
          <div class="flex justify-between items-start">
            <div>
              <h3 class="text-sm font-black text-slate-800 uppercase tracking-wide">${trip.name}</h3>
              ${trip.dates ? `<p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">${trip.dates}</p>` : ''}
            </div>
            ${trip.totalSpent ? `<span class="bg-emerald-100 text-emerald-700 text-[9px] font-black px-2.5 py-1 rounded-full uppercase">Spent: ₹${Math.round(trip.totalSpent).toLocaleString('en-IN')}</span>` : ''}
          </div>
          
          <div class="flex gap-2 pt-1 border-t border-slate-200">
            ${trip.reportUrl ? `
              <a href="${trip.reportUrl}" target="_blank" class="flex-1 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest py-2.5 px-3 rounded-xl text-center flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-sm">
                <i data-lucide="file-text" class="w-3.5 h-3.5"></i> Report
              </a>` : ''}
            ${trip.galleryUrl ? `
              <a href="${trip.galleryUrl}" target="_blank" class="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-100 text-[10px] font-black uppercase tracking-widest py-2.5 px-3 rounded-xl text-center flex items-center justify-center gap-1.5 active:scale-95 transition-all">
                <i data-lucide="image" class="w-3.5 h-3.5"></i> Gallery
              </a>` : ''}
          </div>
        </div>
      `).join('');
      
      lucide.createIcons();
    }

    function closeArchivesModal() {
      const modal = document.getElementById('archives-modal');
      if (modal) {
        modal.classList.add('hidden');
      }
    }

    // ==========================================
    // SQUAD CHAT MODULE LOGIC
    // Includes auto-scroll, commands, and optimistic UI update
    // ==========================================
    let isChatOpen = false;
    let lastMessageCount = 0;

    function openChatModal() {
      isChatOpen = true;
      const modal = document.getElementById('squad-chat-modal');
      document.getElementById('chat-unread-dot').classList.add('hidden'); // Strip red dot
      
      modal.classList.remove('hidden');
      modal.classList.add('anim-chat-open'); // Slide up CSS animation
      document.body.classList.add('overflow-hidden', 'touch-none'); // Block body scrolling
      scrollToBottomChat();
    }

    function closeChatModal() {
      isChatOpen = false;
      const modal = document.getElementById('squad-chat-modal');
      modal.classList.add('hidden');
      modal.classList.remove('anim-chat-open');
      document.body.classList.remove('overflow-hidden', 'touch-none');
    }

    // Chat Quick Actions menu (Help/Support commands)
    function toggleChatCommands() {
      const menu = document.getElementById('chat-command-menu');
      menu.classList.toggle('hidden');
      lucide.createIcons();
    }

    function insertChatCommand(cmd) {
      const input = document.getElementById('chat-input-text');
      if(input.value.trim() === "") {
        input.value = cmd + " ";
      } else {
        input.value = cmd + " " + input.value;
      }
      toggleChatCommands(); 
      input.focus(); 
    }

    // Forces DOM element layout scroll position to maximum height
    function scrollToBottomChat() {
      const chatBox = document.getElementById('ui-chat-messages');
      if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
    }

    // Translates chat array into physical message bubbles
    function renderChatData(messages) {
      const chatBox = document.getElementById('ui-chat-messages');
      if (!chatBox || !messages) return;

      const currentUser = localStorage.getItem('trekLoggedInUser') || "Unknown";
      
      // Update Red Dot Alert Logic on unread message ping
      if (messages.length > lastMessageCount && !isChatOpen && lastMessageCount !== 0) {
        document.getElementById('chat-unread-dot').classList.remove('hidden');
      }
      lastMessageCount = messages.length;

      if (messages.length === 0) {
        chatBox.innerHTML = `<div class="text-center py-10 opacity-50"><i data-lucide="messages-square" class="w-8 h-8 mx-auto mb-2 text-slate-400"></i><p class="text-[10px] font-black tracking-widest uppercase text-slate-400">No messages yet</p></div>`;
        lucide.createIcons();
        return;
      }

      chatBox.innerHTML = messages.map(msg => {
        const isMe = msg.sender === currentUser;
        
        let timeStr = "";
        if (msg.timestamp) {
          try {
            const d = new Date(msg.timestamp);
            timeStr = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
          } catch(e) {}
        }

        // Specific trigger rules for Emergency UI themes
        const textLower = msg.text.toLowerCase();
        const isHighlighted = textLower.includes('/help') || textLower.includes('/support');
        
        let bubbleClassMe = "bg-indigo-600 text-white";
        let bubbleClassThem = "bg-white border border-slate-200 text-slate-800";
        let alertIcon = "";

        if (isHighlighted) {
          bubbleClassMe = "bg-rose-500 text-white border border-rose-400 shadow-[0_4px_15px_rgba(225,29,72,0.4)]";
          bubbleClassThem = "bg-rose-50 border border-rose-300 text-rose-900 shadow-[0_4px_15px_rgba(225,29,72,0.15)]";
          alertIcon = `<i data-lucide="alert-circle" class="w-4 h-4 inline-block mr-1.5 -mt-0.5"></i>`;
        }

        // Layout alignment depends on whether current device sent it
        if (isMe) {
          return `
            <div class="flex flex-col items-end w-full pl-12">
              <div class="${bubbleClassMe} p-3.5 rounded-2xl rounded-tr-sm shadow-sm transition-all break-words max-w-[85%]">
                <p class="text-sm font-bold leading-snug">${alertIcon}${formatMessageText(msg.text)}</p>
              </div>
              <span class="text-[8px] font-black uppercase tracking-widest text-slate-400 mt-1">${timeStr}</span>
            </div>`;
        } else {
          return `
            <div class="flex flex-col items-start w-full pr-12">
              <span class="text-[9px] font-black uppercase tracking-widest ${isHighlighted ? 'text-rose-500' : 'text-indigo-500'} mb-1 ml-1">${msg.sender}</span>
              <div class="${bubbleClassThem} p-3.5 rounded-2xl rounded-tl-sm shadow-sm transition-all">
                <p class="text-sm font-bold leading-snug">${alertIcon}${formatMessageText(msg.text)}</p>
              </div>
              <span class="text-[8px] font-black uppercase tracking-widest text-slate-400 mt-1 ml-1">${timeStr}</span>
            </div>`;
        }
      }).join('');
      
      if (isChatOpen) scrollToBottomChat();
      lucide.createIcons();
    }

    // Master function for pushing text to the backend
    function sendChatMessage(e) {
      e.preventDefault();
      const input = document.getElementById('chat-input-text');
      const text = input.value.trim();
      if (!text) return;

      const currentUser = localStorage.getItem('trekLoggedInUser') || "Unknown";

      // 1. OPTIMISTIC UI UPDATE
      // Creates a faux block immediately so UI doesn't hang waiting for server response
      const tempMessage = {
        timestamp: new Date().toISOString(),
        sender: currentUser,
        text: text
      };

      if (globalActiveDataPayloadBackup && globalActiveDataPayloadBackup.messages) {
        globalActiveDataPayloadBackup.messages.push(tempMessage);
      } else if (globalActiveDataPayloadBackup) {
        globalActiveDataPayloadBackup.messages = [tempMessage];
      }

      renderChatData(globalActiveDataPayloadBackup.messages);

      // 2. Clear out textbox while retaining focus (Prevents keyboard drop)
      input.value = '';
      setTimeout(() => input.focus(), 10);

      // 3. BACKGROUND SYNC API CALL
      apiRequest('message', { sender: currentUser, text })
        .then((freshData) => {
          globalActiveDataPayloadBackup = freshData;
          renderChatData(freshData.messages);
        })
        .catch((err) => {
          console.error(err);
          showToast("Message failed to send. Check network.");
        });
    }

    // ==========================================
    // CHANGE SECURITY PIN LOGIC
    // ==========================================
    function openChangePinModal() {
      toggleMoreMenu(); 
      document.getElementById('cp-old-pin').value = '';
      document.getElementById('cp-new-pin').value = '';
      document.getElementById('cp-error-msg').classList.add('hidden');
      document.getElementById('change-pin-modal').classList.remove('hidden');
      lucide.createIcons();
    }

    function closeChangePinModal() {
      document.getElementById('change-pin-modal').classList.add('hidden');
    }

    function submitPinChange() {
      const oldPin = document.getElementById('cp-old-pin').value;
      const newPin = document.getElementById('cp-new-pin').value;
      const errorMsg = document.getElementById('cp-error-msg');
      const btn = document.getElementById('cp-submit-btn');
      const currentUser = localStorage.getItem('trekLoggedInUser');

      // Reject empty or same PIN entries
      if (!oldPin || oldPin.length !== 4 || !newPin || newPin.length !== 4) {
        errorMsg.innerText = "Please enter 4-digit PINs";
        errorMsg.classList.remove('hidden');
        return;
      }
      if (oldPin === newPin) {
        errorMsg.innerText = "New PIN must be different";
        errorMsg.classList.remove('hidden');
        return;
      }

      // Convert button into spinner loading block
      errorMsg.classList.add('hidden');
      btn.innerHTML = '<div class="w-4 h-4 border-2 border-t-white border-indigo-400 rounded-full animate-spin mx-auto"></div>';
      btn.classList.add('pointer-events-none');

      // Attempt modification through the Vercel API
      apiRequest('change-pin', { name: currentUser, oldPin, newPin })
        .then((result) => {
          btn.innerHTML = 'UPDATE PIN';
          btn.classList.remove('pointer-events-none');

          if (result.success) {
            localStorage.setItem('trekLoggedInPIN', newPin);
            closeChangePinModal();
            showToast("PIN Updated Successfully!");
          } else {
            errorMsg.innerText = result.error || "Incorrect Current PIN";
            errorMsg.classList.remove('hidden');
          }
        })
        .catch(error => {
          console.error(error);
          btn.innerHTML = 'UPDATE PIN';
          btn.classList.remove('pointer-events-none');
          errorMsg.innerText = error.message || "Unable to update PIN";
          errorMsg.classList.remove('hidden');
        });
    }

    // Opens signature pad strictly for the active verified user
    function handleMenuSignOff() {
        const pin = localStorage.getItem('trekLoggedInPIN');
        if (!pin) return;
        openSignaturePad(pin);
        toggleMoreMenu(); 
    }

    // Examines API data array to determine if 'Sign Off' button should be disabled (locked) or enabled
    function refreshMenuSignOffButton(data) {
        const container = document.getElementById('more-sign-off-container');
        if (!container) return;
        
        const pin = localStorage.getItem('trekLoggedInPIN');
        const member = data.members.find(m => String(m.pin).trim() === String(pin).trim());
        
        if (!member) {
            container.innerHTML = "";
            return;
        }

        const isAlreadySigned = member.finalSignOff && member.finalSignOff.length > 50;

        if (data.signOffStatus === "signing off") {
            if (isAlreadySigned) {
                // Gray disabled state
                container.innerHTML = `
                    <div class="px-4 py-2 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center gap-2 border border-slate-200 cursor-not-allowed opacity-60">
                        <i data-lucide="badge-check" class="w-4 h-4 stroke-[2.5]"></i>
                        <span class="text-[10px] font-black uppercase tracking-widest">Signed Off</span>
                    </div>`;
            } else {
                // Black active state
                container.innerHTML = `
                    <div onclick="handleMenuSignOff()" class="px-4 py-2 bg-slate-900 text-white rounded-full flex items-center gap-2 transition-colors active:scale-95 outline-none cursor-pointer">
                        <i data-lucide="pen-tool" class="w-4 h-4 stroke-[2.5]"></i>
                        <span class="text-[10px] font-black uppercase tracking-widest">Sign Off</span>
                    </div>`;
            }
        } else {
            container.innerHTML = ""; 
        }
        lucide.createIcons();
    }

    // Replaces raw url text with parsed href clickable links (For chat)
    function formatMessageText(text) {
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      return text.replace(urlRegex, (url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-600 font-bold hover:underline break-all">${url}</a>`;
      });
    }


// ==========================================
// MULTI-PAGE NAVIGATION HELPERS (added for multi-page split)
// Waits until the first dashboard payload has loaded, then runs a callback.
// Used by each page's small init script at the bottom of the file.
// ==========================================
function waitForData(callback, attemptsLeft) {
  if (attemptsLeft === undefined) attemptsLeft = 100; // ~15s max wait
  if (globalActiveDataPayloadBackup) {
    callback();
  } else if (attemptsLeft > 0) {
    setTimeout(() => waitForData(callback, attemptsLeft - 1), 150);
  }
}
