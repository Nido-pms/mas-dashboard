import type { ReactNode } from 'react';
import AbnormalitiesPage from './features/abnormalities/AbnormalitiesPage';
import AlarmAnalysisPage from './features/alarms/AlarmAnalysisPage';
import AlarmConfigPage from './features/alarms/AlarmConfigPage';
import AttendanceSummaryPage from './features/employee-master/AttendanceSummaryPage';
import EmployeesPage from './features/employee-master/EmployeesPage';
import HomePage from './features/home/HomePage';
import MarkAttendancePage from './features/employee-master/MarkAttendancePage';
import MachineConfigPage from './features/machine-config/MachineConfigPage';
import DayReportPage from './features/mas/DayReportPage';
import HourReportPage from './features/mas/HourReportPage';
import MasLayout from './features/mas/MasLayout';
import ShiftReportPage from './features/mas/ShiftReportPage';
import RejectionCodesPage from './features/rejection-codes/RejectionCodesPage';
import ShiftActivationPage from './features/shift-schedule/ShiftActivationPage';

export interface PageDef {
  path: string;
  label: string;
  icon: string;  // Font Awesome class, e.g. "fa-clock"
  element: ReactNode;
}

export interface NavSection {
  title: string;       // sidebar group heading, or the dropdown label when `icon` is set
  icon?: string;       // set = one collapsible sidebar item with the pages as its sub-items
  layout?: ReactNode;  // optional wrapper shared by the section's pages; must render <Outlet />
  pages: PageDef[];
}

export const HOME = '/mas/home';  // "/" and unknown URLs open this page

// Every page of the app. Adding an entry here adds both the route and the sidebar link.
export const sections: NavSection[] = [
  {
    title: 'Dashboard',
    icon: 'fa-tachometer-alt',
    layout: <MasLayout />,
    pages: [
      { path: '/mas/home', label: 'Home', icon: 'fa-home', element: <HomePage /> },
      { path: '/mas/hour-wise', label: 'Hour-wise report', icon: 'fa-clock', element: <HourReportPage /> },
      { path: '/mas/shift-wise', label: 'Shift-wise report', icon: 'fa-business-time', element: <ShiftReportPage /> },
      { path: '/mas/day-wise', label: 'Day-wise report', icon: 'fa-calendar-day', element: <DayReportPage /> },
      { path: '/mas/abnormalities', label: 'Abnormalities', icon: 'fa-exclamation-triangle', element: <AbnormalitiesPage /> },
      { path: '/mas/alarm-analysis', label: 'Alarm analysis', icon: 'fa-bell', element: <AlarmAnalysisPage /> },
    ],
  },
  {
    title: 'Employee Master',
    icon: 'fa-users',
    pages: [
      { path: '/employees', label: 'Add employee', icon: 'fa-user-plus', element: <EmployeesPage /> },
      { path: '/attendance/mark', label: 'Mark attendance', icon: 'fa-user-check', element: <MarkAttendancePage /> },
      { path: '/attendance/summary', label: 'Attendance summary', icon: 'fa-clipboard-list', element: <AttendanceSummaryPage /> },
    ],
  },
  {
    title: 'Configuration',
    icon: 'fa-sliders-h',
    pages: [
      { path: '/machine-config', label: 'Machine Configuration', icon: 'fa-cogs', element: <MachineConfigPage /> },
      { path: '/shift-activation', label: 'Shift Activation', icon: 'fa-toggle-on', element: <ShiftActivationPage /> },
      { path: '/rejection-codes', label: 'Rejection Code Definition', icon: 'fa-ban', element: <RejectionCodesPage /> },
      { path: '/alarm-config', label: 'Alarm Configuration', icon: 'fa-bell-slash', element: <AlarmConfigPage /> },
    ],
  },
];
