import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  Search,
  Sun,
  Moon,
  Bell,
  HelpCircle,
  User,
  ExternalLink,
  Command,
  CheckCircle2,
  LogOut,
  Shield,
  Key,
  ChevronDown,
  Info,
  UserPlus,
  Calendar
} from 'lucide-react';
import { AppUser } from '../../types/hospital';

interface CarbonHeaderProps {
  activeView: string;
  onNavigate: (viewId: string) => void;
  isSideNavOpen: boolean;
  onToggleSideNav: () => void;
  currentUser: AppUser;
  users: AppUser[];
  onSwitchUser: (userId: string) => void;
  onOpenSearch?: () => void;
  theme?: 'g10' | 'g100';
  onToggleTheme?: () => void;
  onSignOut?: () => void;
  onRegisterPatient?: () => void;
  onBookAppointment?: () => void;
}

export const CarbonHeader: React.FC<CarbonHeaderProps> = ({
  activeView,
  onNavigate,
  isSideNavOpen,
  onToggleSideNav,
  currentUser,
  users,
  onSwitchUser,
  onOpenSearch,
  theme = 'g10',
  onToggleTheme,
  onSignOut,
  onRegisterPatient,
  onBookAppointment
}) => {
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const notificationsRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (profileRef.current && !profileRef.current.contains(target)) {
        setIsProfileOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(target)) {
        setIsNotificationsOpen(false);
      }
      if (helpRef.current && !helpRef.current.contains(target)) {
        setIsHelpOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsProfileOpen(false);
        setIsNotificationsOpen(false);
        setIsHelpOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <>
      <header className="carbon-header-bar fixed top-0 left-0 right-0 z-50 h-12 bg-[#161616] border-b border-[#393939] text-white flex items-center justify-between px-0 select-none w-full max-w-full">
        {/* 1. Skip-to-content control (Accessibility standard) */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-1.5 focus:left-2 focus:z-50 focus:px-3 focus:py-1.5 focus:bg-[#0f62fe] focus:text-white text-xs font-mono font-medium shadow-lg"
        >
          Skip to content
        </a>

        {/* Left Section: 2. Mobile Nav Toggle & 3. Brand Link */}
        <div className="flex items-center h-full min-w-0">
          {/* 2. Mobile navigation drawer toggle */}
          <button
            onClick={onToggleSideNav}
            className="w-10 sm:w-12 h-12 flex items-center justify-center text-[#c6c6c6] hover:text-white hover:bg-[#262626] transition-colors rounded-none focus:outline-none focus:ring-1 focus:ring-white cursor-pointer shrink-0"
            title={isSideNavOpen ? 'Collapse Navigation' : 'Expand Navigation'}
            aria-label="Toggle Navigation Drawer"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* 3. SAHACHARA / Ayurveda Operations Brand Link to /dashboard */}
          <button
            onClick={() => onNavigate('overview')}
            className="flex items-center h-12 px-2 sm:px-3.5 hover:bg-[#262626] transition-colors rounded-none focus:outline-none focus:ring-1 focus:ring-white text-left cursor-pointer shrink-0"
            title="SAHACHARA / Ayurveda Operations"
          >
            <span className="font-bold text-white text-[13px] sm:text-[14px] tracking-[0.32px] uppercase">
              SAHACHARA
            </span>
            <span className="hidden sm:inline text-[#8d8d8d] font-light mx-2 text-[14px]">/</span>
            <span className="hidden sm:inline font-normal text-[#f4f4f4] text-[13px] tracking-[0.16px] whitespace-nowrap">
              Ayurveda Operations
            </span>
          </button>
        </div>

        {/* Clinical Action Buttons: Register Patient & Book Appointment */}
        <div className="flex items-center h-full gap-1 sm:gap-2 px-1 sm:px-2 shrink-0">
          {onRegisterPatient && (
            <button
              onClick={onRegisterPatient}
              className="h-8 px-2.5 sm:px-3 bg-[#0f62fe] hover:bg-[#0353e9] active:bg-[#002d9c] text-white text-xs font-medium hidden sm:flex items-center gap-1.5 transition-colors focus:outline-none focus:ring-1 focus:ring-white cursor-pointer shadow-sm rounded-none"
              title="Register Patient (New Patient Dossier for Sahachara Ayurveda Clinic)"
              aria-label="Register Patient"
            >
              <UserPlus className="w-3.5 h-3.5 shrink-0" />
              <span className="font-semibold tracking-wide">Register Patient</span>
            </button>
          )}

          {onBookAppointment && (
            <button
              onClick={onBookAppointment}
              className="h-8 px-2.5 sm:px-3 bg-transparent hover:bg-[#262626] border border-[#393939] hover:border-[#525252] text-[#f4f4f4] text-xs font-medium hidden md:flex items-center gap-1.5 transition-colors focus:outline-none focus:ring-1 focus:ring-white cursor-pointer rounded-none"
              title="Book Appointment (Consultation Scheduling for Patients)"
              aria-label="Book Appointment"
            >
              <Calendar className="w-3.5 h-3.5 text-[#a6c8ff] shrink-0" />
              <span className="tracking-wide">Book Appointment</span>
            </button>
          )}
        </div>

        {/* Right Section: Controls 4 to 8 in exact specification sequence */}
        <div className="flex items-center h-full shrink-0">
          {/* 4. Global operational search (⌘K / Ctrl+K) */}
          <button
            onClick={onOpenSearch}
            className="h-12 px-2 sm:px-3 flex items-center gap-2 text-[#c6c6c6] hover:text-white hover:bg-[#262626] transition-colors focus:outline-none focus:ring-1 focus:ring-white cursor-pointer"
            title="Global Operational Search (⌘K / Ctrl+K)"
            aria-label="Search operational destinations"
          >
            <Search className="w-4 h-4" />
            <span className="hidden md:inline-flex text-[11px] font-mono text-[#8d8d8d] items-center gap-1 bg-[#262626] px-1.5 py-0.5 border border-[#393939]">
              <Command className="w-2.5 h-2.5" /> K
            </span>
          </button>

          {/* 5. Light/dark theme toggle (Carbon g10 / g100) */}
          <button
            onClick={() => onToggleTheme && onToggleTheme()}
            className="w-9 sm:w-12 h-12 flex items-center justify-center text-[#c6c6c6] hover:text-white hover:bg-[#262626] transition-colors focus:outline-none focus:ring-1 focus:ring-white cursor-pointer"
            title={`Toggle Theme: currently Carbon ${theme === 'g100' ? 'g100 (Dark)' : 'g10 (Light)'}`}
            aria-label="Toggle light or dark theme"
          >
            {theme === 'g100' ? (
              <Sun className="w-4 h-4 text-[#f1c21b]" />
            ) : (
              <Moon className="w-4 h-4 text-[#c6c6c6]" />
            )}
          </button>

          {/* 6. System Notifications Popover (0 Alerts, all systems operational) */}
          <div className="relative" ref={notificationsRef}>
            <button
              onClick={() => {
                setIsNotificationsOpen((prev) => !prev);
                setIsHelpOpen(false);
                setIsProfileOpen(false);
              }}
              className={`w-9 sm:w-12 h-12 flex items-center justify-center transition-colors focus:outline-none focus:ring-1 focus:ring-white cursor-pointer ${
                isNotificationsOpen ? 'bg-[#262626] text-white' : 'text-[#c6c6c6] hover:text-white hover:bg-[#262626]'
              }`}
              title="System Notifications (0 Alerts)"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
            </button>

            {isNotificationsOpen && (
              <div
                className="absolute right-0 top-12 w-80 max-w-[calc(100vw-16px)] bg-[#161616] border border-[#393939] shadow-2xl text-white p-4 z-50 animate-in fade-in duration-100"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-[#393939] pb-2 mb-3">
                  <span className="font-semibold text-xs tracking-wider uppercase text-white">
                    System Notifications
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#262626] text-[#c6c6c6] border border-[#393939]">
                    0 Alerts
                  </span>
                </div>

                <div className="py-3 px-2 bg-[#262626] border border-[#393939] flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#24a148] shrink-0 animate-pulse" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white">All clinical systems operational.</p>
                    <p className="text-[11px] text-[#8d8d8d] mt-0.5">NestJS / PostgreSQL API services active at /api/v1</p>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-[#393939] text-[11px] text-[#8d8d8d] flex justify-between">
                  <span>HIPAA Compliance Active</span>
                  <span className="font-mono text-[#0f62fe]">Status 200 OK</span>
                </div>
              </div>
            )}
          </div>

          {/* 7. Help and Documentation Popover */}
          <div className="relative hidden sm:block" ref={helpRef}>
            <button
              onClick={() => {
                setIsHelpOpen((prev) => !prev);
                setIsNotificationsOpen(false);
                setIsProfileOpen(false);
              }}
              className={`w-9 sm:w-12 h-12 flex items-center justify-center transition-colors focus:outline-none focus:ring-1 focus:ring-white cursor-pointer ${
                isHelpOpen ? 'bg-[#262626] text-white' : 'text-[#c6c6c6] hover:text-white hover:bg-[#262626]'
              }`}
              title="Help and Documentation"
              aria-label="Help & Documentation"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {isHelpOpen && (
              <div
                className="absolute right-0 top-12 w-84 max-w-[calc(100vw-16px)] bg-[#161616] border border-[#393939] shadow-2xl text-white p-4 z-50 animate-in fade-in duration-100"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-[#393939] pb-2 mb-3">
                  <span className="font-semibold text-xs tracking-wider uppercase text-white flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-[#0f62fe]" /> Help & Documentation
                  </span>
                  <span className="text-[10px] font-mono text-[#8d8d8d]">v2.4.0</span>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-2.5 bg-[#262626] border border-[#393939] space-y-1">
                    <div className="text-[11px] text-[#8d8d8d] uppercase font-mono">Application Version</div>
                    <div className="font-semibold text-white">Sahachara Ayurveda Operations v2.4.0</div>
                    <div className="text-[11px] text-[#c6c6c6]">Enterprise Carbon Design System v11</div>
                  </div>

                  <div className="p-2.5 bg-[#262626] border border-[#393939] space-y-1">
                    <div className="text-[11px] text-[#8d8d8d] uppercase font-mono">REST API & Swagger</div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[#a6c8ff]">/api/v1/docs</span>
                      <span className="text-[10px] font-mono text-[#24a148] flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-[#24a148]" /> Mounted
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-[#262626] border border-[#393939] space-y-1">
                    <div className="text-[11px] text-[#8d8d8d] uppercase font-mono">Approved Staff Domain</div>
                    <div className="font-mono text-white">@sahachara.org</div>
                  </div>

                  <div className="p-2.5 bg-[#262626] border border-[#393939] flex items-center justify-between">
                    <div>
                      <div className="text-[11px] text-[#8d8d8d] uppercase font-mono">Operational Search</div>
                      <div className="text-white">Global Shortcut</div>
                    </div>
                    <span className="font-mono text-xs px-2 py-0.5 bg-[#161616] border border-[#393939] text-[#a6c8ff]">
                      ⌘K / Ctrl+K
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 8. Staff Profile Menu */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => {
                setIsProfileOpen((prev) => !prev);
                setIsNotificationsOpen(false);
                setIsHelpOpen(false);
              }}
              className={`h-12 px-2 sm:px-3 flex items-center gap-1.5 sm:gap-2.5 transition-colors focus:outline-none focus:ring-1 focus:ring-white cursor-pointer ${
                isProfileOpen ? 'bg-[#262626] text-white' : 'text-[#c6c6c6] hover:text-white hover:bg-[#262626]'
              }`}
              title={`Staff Session: ${currentUser.name} (${currentUser.role}) - Click for Logout`}
              aria-label="Staff Profile and Logout"
            >
              <div className="w-7 h-7 bg-[#0f62fe] text-white font-mono text-xs flex items-center justify-center font-semibold shrink-0">
                {currentUser.avatarInitials || 'SC'}
              </div>
              <div className="block text-left">
                <div className="text-xs font-medium text-white truncate max-w-[80px] sm:max-w-[140px] md:max-w-[180px] leading-tight">
                  {currentUser.name}
                </div>
                <div className="text-[10px] text-[#8d8d8d] truncate font-mono hidden sm:block leading-tight">
                  {currentUser.role}
                </div>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-[#8d8d8d] transition-transform shrink-0 ${isProfileOpen ? 'rotate-180' : ''}`} />
            </button>

            {isProfileOpen && (
              <div
                className="absolute right-0 top-12 w-72 sm:w-80 max-w-[calc(100vw-16px)] max-h-[calc(100vh-60px)] overflow-y-auto bg-[#161616] border border-[#393939] shadow-2xl text-white p-3 z-50 animate-in fade-in duration-100"
                onClick={(e) => e.stopPropagation()}
              >
                {/* 1. Profile Identity Header */}
                <div className="p-2.5 bg-[#262626] border border-[#393939] mb-2.5">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-white truncate">{currentUser.name}</div>
                    <span className="px-1.5 py-0.5 bg-[#0f62fe] text-white font-mono text-[10px] font-semibold">
                      {currentUser.role}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#a6c8ff] font-mono mt-1 truncate">{currentUser.email}</div>
                  <div className="text-[10px] text-[#8d8d8d] mt-1 font-sans">
                    Session: <span className="text-[#24a148] font-mono">Authenticated (HIPAA Active)</span>
                  </div>
                </div>

                {/* 2. Direct Primary Logout Button right when clicking profile */}
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileOpen(false);
                    if (onSignOut) {
                      onSignOut();
                    } else {
                      onNavigate('login');
                    }
                  }}
                  className="w-full h-10 px-3 bg-[#da1e28] hover:bg-[#ba1b23] active:bg-[#750e13] text-white text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer rounded-none shadow-sm mb-2.5 group"
                  title="Sign Out of Session Immediately"
                  aria-label="Log Out"
                >
                  <div className="flex items-center gap-2">
                    <LogOut className="w-4 h-4 text-white shrink-0" />
                    <span className="font-semibold tracking-[0.16px]">Log Out</span>
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-white/90 bg-black/20 px-1.5 py-0.5 border border-white/20">
                    Sign Out
                  </span>
                </button>

                {/* 2. Theme Switcher in Profile Menu */}
                <div className="p-2 bg-[#262626] border border-[#393939] mb-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {theme === 'g100' ? (
                      <Sun className="w-4 h-4 text-[#f1c21b] shrink-0" />
                    ) : (
                      <Moon className="w-4 h-4 text-[#c6c6c6] shrink-0" />
                    )}
                    <div>
                      <div className="text-xs font-medium text-white">Interface Theme</div>
                      <div className="text-[10px] text-[#8d8d8d] font-mono">
                        Carbon {theme === 'g100' ? 'g100 (Dark)' : 'g10 (Light)'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (onToggleTheme) onToggleTheme();
                    }}
                    className="px-2.5 py-1 text-[11px] font-mono bg-[#161616] hover:bg-[#393939] text-[#a6c8ff] border border-[#393939] transition-colors cursor-pointer"
                    title={`Switch to ${theme === 'g100' ? 'Light (g10)' : 'Dark (g100)'} theme`}
                  >
                    Switch to {theme === 'g100' ? 'Light' : 'Dark'}
                  </button>
                </div>

                {/* 3. Switch Active Role / Account */}
                <div className="mb-2.5">
                  <div className="text-[10px] font-mono uppercase text-[#8d8d8d] px-1 mb-1.5 flex items-center justify-between">
                    <span>Switch Staff Persona</span>
                    <span className="text-[9px] text-[#525252] font-mono">RBAC</span>
                  </div>
                  <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                    {users.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => {
                          onSwitchUser(u.id);
                          setIsProfileOpen(false);
                        }}
                        className={`w-full px-2.5 py-1.5 text-left text-xs flex items-center justify-between transition-colors cursor-pointer rounded-none ${
                          u.id === currentUser.id
                            ? 'bg-[#0f62fe]/20 text-[#a6c8ff] font-medium border border-[#0f62fe]/50'
                            : 'text-[#c6c6c6] hover:bg-[#262626] hover:text-white'
                        }`}
                      >
                        <div className="truncate pr-2">
                          <div className="font-medium truncate">{u.name}</div>
                          <div className="text-[10px] text-[#8d8d8d]">{u.title || u.role}</div>
                        </div>
                        <span className="text-[10px] font-mono px-1 py-0.5 bg-[#161616] text-[#8d8d8d] shrink-0 border border-[#393939]">
                          {u.role}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Profile & Settings Link and Bottom Log Out Button */}
                <div className="border-t border-[#393939] pt-2 space-y-1">
                  <button
                    onClick={() => {
                      onNavigate('settings');
                      setIsProfileOpen(false);
                    }}
                    className="w-full px-2.5 py-1.5 text-left text-xs text-[#c6c6c6] hover:bg-[#262626] hover:text-white flex items-center justify-between transition-colors cursor-pointer rounded-none"
                  >
                    <span>My Profile & Security Settings</span>
                    <Key className="w-3.5 h-3.5 text-[#8d8d8d]" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileOpen(false);
                      if (onSignOut) {
                        onSignOut();
                      } else {
                        onNavigate('login');
                      }
                    }}
                    className="w-full px-2.5 py-2 text-left text-xs font-medium text-[#ff8389] hover:bg-[#da1e28] hover:text-white flex items-center justify-between transition-colors cursor-pointer rounded-none group"
                    title="Log Out of Sahachara Ops"
                    aria-label="Log Out"
                  >
                    <div className="flex items-center gap-2">
                      <LogOut className="w-3.5 h-3.5 shrink-0 text-[#ff8389] group-hover:text-white" />
                      <span className="font-semibold">Log Out</span>
                    </div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#8d8d8d] group-hover:text-white">
                      Sign Out
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
};
