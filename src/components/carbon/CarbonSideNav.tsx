import React, { useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  Calendar,
  BookOpen,
  Activity,
  FlaskConical,
  Package,
  Receipt,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut
} from 'lucide-react';
import { AppUser } from '../../types/hospital';

export interface PrimaryNavItem {
  id: string;
  label: string;
  route: string;
  icon: React.ElementType;
}

// Exactly 10 primary nav items per specification with divider before Reports
export const PRIMARY_NAV_ITEMS: PrimaryNavItem[] = [
  {
    id: 'overview',
    label: 'Dashboard',
    route: '/dashboard',
    icon: LayoutDashboard
  },
  {
    id: 'patients',
    label: 'Patients',
    route: '/patients',
    icon: Users
  },
  {
    id: 'appointments',
    label: 'Appointments',
    route: '/appointments',
    icon: Calendar
  },
  {
    id: 'consultations',
    label: 'Consultations',
    route: '/consultations',
    icon: BookOpen
  },
  {
    id: 'treatments',
    label: 'Treatments',
    route: '/treatments',
    icon: Activity
  },
  {
    id: 'panchakarma',
    label: 'Panchakarma',
    route: '/panchakarma',
    icon: FlaskConical
  },
  {
    id: 'pharmacy',
    label: 'Pharmacy',
    route: '/pharmacy',
    icon: Package
  },
  {
    id: 'billing',
    label: 'Billing',
    route: '/billing',
    icon: Receipt
  },
  // Divider before Reports
  {
    id: 'reports',
    label: 'Reports',
    route: '/reports',
    icon: BarChart3
  },
  {
    id: 'settings',
    label: 'Settings',
    route: '/settings',
    icon: Settings
  }
];

interface CarbonSideNavProps {
  activeView: string;
  onNavigate: (viewId: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  currentUser: AppUser;
  onSignOut?: () => void;
}

export const CarbonSideNav: React.FC<CarbonSideNavProps> = ({
  activeView,
  onNavigate,
  isOpen,
  onToggle,
  currentUser,
  onSignOut
}) => {
  // Sync collapse state with localStorage key sahachara.sidebar.collapsed
  useEffect(() => {
    try {
      localStorage.setItem('sahachara.sidebar.collapsed', isOpen ? 'false' : 'true');
    } catch {
      // Ignore localStorage failure
    }
  }, [isOpen]);

  const handleNavClick = (itemId: string) => {
    onNavigate(itemId);
    // On mobile screens (< 1056px), close the drawer on selection
    if (window.innerWidth <= 1056 && isOpen) {
      onToggle();
    }
  };

  const firstGroup = PRIMARY_NAV_ITEMS.slice(0, 8); // Items 1 - 8
  const secondGroup = PRIMARY_NAV_ITEMS.slice(8);   // Items 9 & 10 (Reports, Settings)

  return (
    <>
      {/* Mobile Backdrop Overlay (width <= 1056px) */}
      {isOpen && (
        <div
          onClick={onToggle}
          className="fixed inset-0 bg-black/60 z-30 lg:hidden backdrop-blur-xs transition-opacity duration-200"
          aria-hidden="true"
        />
      )}

      {/* Nav Sidebar Rail */}
      <aside
        className={`carbon-sidenav fixed left-0 top-12 bottom-0 h-[calc(100vh-48px)] bg-[#161616] border-r border-[#393939] z-40 flex flex-col justify-between overflow-hidden select-none transition-all duration-200 ${
          isOpen
            ? 'w-64 translate-x-0'
            : '-translate-x-full lg:translate-x-0 lg:w-16'
        }`}
        aria-label="Primary Navigation"
      >
        {/* Navigation Rail Items Container */}
        <div className="py-2 overflow-y-auto overflow-x-hidden flex-1 flex flex-col justify-start scrollbar-none">
          {/* Primary Operations Group (1 - 8) */}
          <div className="space-y-0.5">
            {firstGroup.map((item) => {
              const Icon = item.icon;
              // Active state matches exact or activeView
              const isActive = activeView === item.id || (activeView === 'overview' && item.id === 'overview');
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`group relative w-full h-11 px-3.5 flex items-center ${
                    isOpen ? 'justify-start' : 'justify-center'
                  } text-[13px] font-normal transition-colors cursor-pointer rounded-none text-left ${
                    isActive
                      ? 'bg-[#262626] text-white font-medium'
                      : 'text-[#c6c6c6] hover:bg-[#262626]/80 hover:text-white'
                  }`}
                  title={!isOpen ? item.label : undefined}
                >
                  {/* Left Active Indicator Bar (IBM Carbon 3px #0f62fe) */}
                  {isActive && (
                    <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#0f62fe]" />
                  )}

                  <div className="flex items-center gap-3 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        isActive ? 'text-[#0f62fe]' : 'text-[#8d8d8d] group-hover:text-white'
                      }`}
                    />
                    {isOpen && (
                      <span className="truncate tracking-[0.16px]">{item.label}</span>
                    )}
                  </div>

                  {/* Desktop Collapsed Tooltip */}
                  {!isOpen && (
                    <div className="absolute left-16 px-2.5 py-1 bg-[#161616] border border-[#393939] text-white text-xs whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 z-50 transition-opacity shadow-lg">
                      {item.label}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Visual Divider before Reports */}
          <div className="my-2 border-t border-[#393939] mx-3" role="separator" />

          {/* Analytics & Configuration Group (9 & 10) */}
          <div className="space-y-0.5">
            {secondGroup.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`group relative w-full h-11 px-3.5 flex items-center ${
                    isOpen ? 'justify-start' : 'justify-center'
                  } text-[13px] font-normal transition-colors cursor-pointer rounded-none text-left ${
                    isActive
                      ? 'bg-[#262626] text-white font-medium'
                      : 'text-[#c6c6c6] hover:bg-[#262626]/80 hover:text-white'
                  }`}
                  title={!isOpen ? item.label : undefined}
                >
                  {isActive && (
                    <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#0f62fe]" />
                  )}

                  <div className="flex items-center gap-3 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        isActive ? 'text-[#0f62fe]' : 'text-[#8d8d8d] group-hover:text-white'
                      }`}
                    />
                    {isOpen && (
                      <span className="truncate tracking-[0.16px]">{item.label}</span>
                    )}
                  </div>

                  {!isOpen && (
                    <div className="absolute left-16 px-2.5 py-1 bg-[#161616] border border-[#393939] text-white text-xs whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 z-50 transition-opacity shadow-lg">
                      {item.label}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sign Out Action Button */}
        {onSignOut && (
          <div className="border-t border-[#393939] bg-[#161616]">
            {isOpen ? (
              <button
                type="button"
                onClick={() => {
                  onSignOut();
                  if (window.innerWidth <= 1056 && isOpen) {
                    onToggle();
                  }
                }}
                className="w-full h-11 px-3.5 flex items-center justify-between text-xs font-medium text-[#ff8389] hover:bg-[#da1e28] hover:text-white transition-colors cursor-pointer rounded-none group"
                title="Sign Out / Terminate Session"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <LogOut className="w-4 h-4 text-[#ff8389] group-hover:text-white shrink-0" />
                  <span className="truncate font-semibold tracking-[0.16px]">Sign Out / Log Out</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#262626] text-[#ff8389] group-hover:bg-[#ba1b23] group-hover:text-white border border-[#393939]">
                  Exit
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onSignOut}
                className="w-full h-11 flex items-center justify-center text-[#ff8389] hover:bg-[#da1e28] hover:text-white transition-colors cursor-pointer rounded-none group relative"
                title="Sign Out / Log Out"
                aria-label="Sign Out"
              >
                <LogOut className="w-4 h-4 text-[#ff8389] group-hover:text-white" />
                <div className="absolute left-16 px-2.5 py-1 bg-[#161616] border border-[#393939] text-[#ff8389] text-xs whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 z-50 transition-opacity shadow-lg">
                  Sign Out / Log Out
                </div>
              </button>
            )}
          </div>
        )}

        {/* Footer Collapse/Expand Toggle (Saves state in localStorage) */}
        <div className="p-2 border-t border-[#393939] bg-[#1a1a1a] text-[11px] text-[#8d8d8d] flex items-center justify-between shrink-0">
          {isOpen ? (
            <>
              <div className="truncate px-1">
                <div className="text-white font-medium text-xs tracking-tight">Ayurveda Operations</div>
                <div className="text-[10px] text-[#8d8d8d] leading-tight font-mono">Role: {currentUser.role}</div>
              </div>
              <button
                onClick={onToggle}
                className="p-1.5 text-[#8d8d8d] hover:text-white hover:bg-[#262626] transition-colors rounded-none cursor-pointer"
                title="Collapse Sidebar"
                aria-label="Collapse Sidebar"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              onClick={onToggle}
              className="w-full flex items-center justify-center py-1.5 text-[#8d8d8d] hover:text-white hover:bg-[#262626] transition-colors rounded-none cursor-pointer"
              title="Expand Sidebar"
              aria-label="Expand Sidebar"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>
    </>
  );
};
