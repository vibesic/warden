# AI Agent React Behavior - Quick Reference

**Project**: Warden (warden)  
**Framework**: React 18 + TypeScript + React Router  
**Style**: Functional components, hooks, type-safe props

## Component Structure

### Standard Template (Follow This Order)

```typescript
// 1. Imports (external → internal → types → styles)
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTeacherSocket } from '@/hooks/useTeacherSocket';
import { Card } from '@/components/common/Card';
import type { StudentStatus } from '@/types';

// 2. Types/Interfaces
interface SessionDetailProps {
  sessionCode: string;
  onEndSession?: () => void;
}

// 3. Constants
const POLL_INTERVAL_MS = 15000;

// 4. Component
export const SessionDetail: React.FC<SessionDetailProps> = ({ sessionCode, onEndSession }) => {
  // 4a. Hooks (useState, useContext, custom hooks)
  const navigate = useNavigate();
  const { students, isConnected } = useTeacherSocket(sessionCode);
  const [loading, setLoading] = useState(true);

  // 4b. Effects
  useEffect(() => {
    // Setup and cleanup
  }, [sessionCode]);

  // 4c. Event Handlers (useCallback for optimization)
  const handleEndSession = useCallback((): void => {
    onEndSession?.();
    navigate('/teacher');
  }, [onEndSession, navigate]);

  // 4d. Early Returns
  if (loading) return <LoadingSpinner />;

  // 4e. Main Render
  return (
    <div className="session-detail">
      {Object.values(students).map(student => (
        <StudentCard key={student.studentId} student={student} />
      ))}
    </div>
  );
};
```

## Component Rules

**DO:**

- Use functional components with `React.FC<Props>`
- Destructure props in function signature
- Keep components < 300 lines
- Use early returns for loading/error states
- Use `useCallback` for event handlers passed to children
- Use `useMemo` for expensive computations
- Add TypeScript types for all props

**DON'T:**

- Use class components
- Use inline functions in JSX for child components
- Mutate state directly
- Use index as key (use unique identifiers)
- Forget cleanup in useEffect
- Create components inside components

## State Management

### Local State (useState)

```typescript
const [students, setStudents] = useState<Record<string, StudentStatus>>({});
const [isConnected, setIsConnected] = useState(false);
const [selectedStudent, setSelectedStudent] = useState<StudentStatus | null>(null);
```

### Complex State (useReducer)

```typescript
type Action =
  | { type: 'STUDENT_JOINED'; payload: StudentStatus }
  | { type: 'STUDENT_LEFT'; payload: string }
  | { type: 'VIOLATION_ADDED'; payload: { studentId: string; violation: Violation } };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'STUDENT_JOINED':
      return { ...state, students: { ...state.students, [action.payload.studentId]: action.payload } };
    case 'VIOLATION_ADDED':
      // Immutable update
      return state;
    default:
      return state;
  }
}
```

## Custom Hooks Pattern

### Socket.io Hooks (Core Pattern)

```typescript
// hooks/useTeacherSocket.ts
export const useTeacherSocket = (sessionCode: string) => {
  const [students, setStudents] = useState<Record<string, StudentStatus>>({});
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socket = io(API_BASE_URL);

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('student:joined', (data) => {
      setStudents(prev => ({ ...prev, [data.studentId]: data }));
    });

    return () => { socket.disconnect(); };
  }, [sessionCode]);

  return { students, isConnected };
};
```

### Internet Sniffer Hook

```typescript
// hooks/useInternetSniffer.ts
export const useInternetSniffer = () => {
  const [isSecure, setIsSecure] = useState(true);

  useEffect(() => {
    const probeTargets = HARDCODED_PROBE_TARGETS;
    // Periodically probe targets to detect internet access
    const interval = setInterval(() => checkProbes(probeTargets), 10000);
    return () => clearInterval(interval);
  }, []);

  return { isSecure };
};
```

## Context Pattern

### Create Context with Hook

```typescript
interface AuthContextValue {
  isAuthenticated: boolean;
  token: string | null;
  login: (password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  // ...
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
```

## Performance Optimization

### React.memo (Prevent Re-renders)

```typescript
export const StudentCard = React.memo<StudentCardProps>(({ student, onSelect }) => {
  return (
    <div onClick={() => onSelect(student)}>
      <h3>{student.name}</h3>
      <span>{student.violations.length} violations</span>
    </div>
  );
});
```

### useCallback / useMemo

```typescript
const handleEndSession = useCallback(() => {
  endSession();
  navigate('/teacher');
}, [endSession, navigate]);

const sortedStudents = useMemo(() => {
  return Object.values(students).sort((a, b) => a.studentId.localeCompare(b.studentId));
}, [students]);
```

### Code Splitting

```typescript
import { lazy, Suspense } from 'react';

const SessionDetail = lazy(() => import('./components/SessionDetail'));

const App = () => (
  <Suspense fallback={<LoadingSpinner />}>
    <SessionDetail />
  </Suspense>
);
```

## File Organization

```
src/
├── components/
│   ├── common/             # Reusable (Button, Card, Modal, Table, StatusBadge)
│   ├── layout/             # Layout (Header)
│   ├── TeacherLogin.tsx    # Teacher authentication
│   ├── TeacherDashboard.tsx # Session management
│   ├── SessionDetail.tsx   # Real-time student monitoring
│   ├── SecureExamMonitor.tsx # Student exam view
│   └── StudentLogin.tsx    # Student registration
├── hooks/
│   ├── useTeacherSocket.ts  # Teacher Socket.io connection
│   ├── useExamSocket.ts     # Student Socket.io connection
│   └── useInternetSniffer.ts # Internet detection probes
├── context/                # React contexts
├── config/                 # App configuration
├── App.tsx                 # Root component + routes
└── main.tsx                # Entry point
```

## Critical Rules

1. **Structure**: Follow template order (imports → types → constants → hooks → effects → handlers → render)
2. **Types**: Always use `React.FC<Props>` with explicit prop types
3. **Performance**: Use `React.memo`, `useCallback`, `useMemo` appropriately
4. **State**: Keep local when possible, Context for global, never mutate
5. **Hooks**: Extract reusable logic into custom hooks (especially Socket.io)
6. **Cleanup**: Always clean up Socket.io connections and intervals in useEffect
7. **Loading**: Always show loading states, use Suspense for lazy loading
