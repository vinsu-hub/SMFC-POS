import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, Clock } from 'lucide-react';

export default function HRFlags() {
  const { user } = useAuth();

  if (!user || user.role !== 'executive') {
    return (
      <DashboardLayout>
        <div className="p-6 text-center">
          <p className="text-red-600">Access denied. This page is for executives only.</p>
        </div>
      </DashboardLayout>
    );
  }

  // Mock HR data (matches the seeded demo accounts in scripts/seed_demo.py)
  const staffRoster = [
    {
      id: '1',
      name: 'Marco',
      branch: 'Danielito\'s',
      branchColor: '#1F2E28',
      status: 'on-time',
      latenessCount: 0,
      absenceCount: 0,
    },
    {
      id: '2',
      name: 'Rosa',
      branch: 'Danielito\'s',
      branchColor: '#1F2E28',
      status: 'on-time',
      latenessCount: 0,
      absenceCount: 0,
    },
    {
      id: '3',
      name: 'Javier',
      branch: 'Malaya\'s Cafe',
      branchColor: '#6E8368',
      status: 'late',
      latenessCount: 3,
      absenceCount: 0,
    },
    {
      id: '4',
      name: 'Ana',
      branch: 'Malaya\'s Cafe',
      branchColor: '#6E8368',
      status: 'on-time',
      latenessCount: 0,
      absenceCount: 0,
    },
    {
      id: '5',
      name: 'Diego',
      branch: 'D\' Bar',
      branchColor: '#B5651D',
      status: 'absent',
      latenessCount: 1,
      absenceCount: 2,
    },
    {
      id: '6',
      name: 'Carmen',
      branch: 'D\' Bar',
      branchColor: '#B5651D',
      status: 'on-time',
      latenessCount: 0,
      absenceCount: 0,
    },
  ];

  const hrFlags = [
    {
      id: '1',
      employeeId: '3',
      employeeName: 'Javier',
      branch: 'Malaya\'s Cafe',
      branchColor: '#6E8368',
      flagType: 'lateness',
      description: 'Javier has been late 3 times in the past 2 weeks. Pattern detected on Mondays and Fridays.',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      resolved: false,
    },
    {
      id: '2',
      employeeId: '5',
      employeeName: 'Diego',
      branch: 'D\' Bar',
      branchColor: '#B5651D',
      flagType: 'absence',
      description: 'Diego has been absent 2 times this month. Recommend check-in conversation.',
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
      resolved: false,
    },
    {
      id: '3',
      employeeId: '1',
      employeeName: 'Marco',
      branch: 'Danielito\'s',
      branchColor: '#1F2E28',
      flagType: 'lateness',
      description: 'Marco was 5 minutes late today. First incident in 6 months. No action needed.',
      timestamp: new Date(Date.now() - 60 * 60 * 1000),
      resolved: true,
    },
  ];

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'on-time':
        return <div className="w-3 h-3 rounded-full bg-green-500" />;
      case 'late':
        return <div className="w-3 h-3 rounded-full bg-yellow-500" />;
      case 'absent':
        return <div className="w-3 h-3 rounded-full bg-red-500" />;
      default:
        return <div className="w-3 h-3 rounded-full bg-gray-300" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'on-time':
        return 'On Time';
      case 'late':
        return 'Late';
      case 'absent':
        return 'Absent';
      default:
        return 'Unknown';
    }
  };

  return (
    <DashboardLayout title="HR Flags & Attendance">
      <div className="p-6 space-y-6">
        {/* Active Flags */}
        <div>
          <h2 className="text-xl font-corp-display font-semibold text-gray-900 mb-4">
            Active Flags
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {hrFlags
              .filter((f) => !f.resolved)
              .map((flag) => (
                <Card
                  key={flag.id}
                  className="border-l-4"
                  style={{ borderLeftColor: flag.branchColor }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h3 className="font-corp-display font-semibold text-gray-900">
                          {flag.employeeName}
                        </h3>
                        <p className="text-xs text-gray-500 font-corp-body mb-2">
                          {flag.branch}
                        </p>
                        <p className="text-sm font-corp-body text-gray-700 mb-3">
                          {flag.description}
                        </p>
                        <div className="flex items-center justify-between">
                          <Badge
                            variant={
                              flag.flagType === 'lateness' ? 'secondary' : 'destructive'
                            }
                            className="capitalize"
                          >
                            {flag.flagType.replace('_', ' ')}
                          </Badge>
                          <span className="text-xs text-gray-500">
                            {flag.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </div>

        {/* Staff Roster */}
        <Card className="border-l-4 border-l-[#1B2A4A]">
          <CardHeader>
            <CardTitle className="font-corp-display">Staff Roster</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {staffRoster.map((staff) => (
                <div
                  key={staff.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                  style={{ borderLeftColor: staff.branchColor, borderLeftWidth: '4px' }}
                >
                  <div className="flex items-center gap-3 flex-1">
                    {getStatusDot(staff.status)}
                    <div>
                      <p className="font-corp-body font-semibold text-gray-900">
                        {staff.name}
                      </p>
                      <p className="text-xs text-gray-500">{staff.branch}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-gray-600 font-corp-body">
                        {getStatusLabel(staff.status)}
                      </p>
                      {staff.latenessCount > 0 || staff.absenceCount > 0 ? (
                        <p className="text-xs text-gray-500">
                          {staff.latenessCount}L • {staff.absenceCount}A
                        </p>
                      ) : (
                        <p className="text-xs text-green-600 font-semibold">Good standing</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Resolved Flags */}
        <Card className="border-l-4 border-l-green-500 bg-green-50">
          <CardHeader>
            <CardTitle className="font-corp-display flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Resolved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {hrFlags
                .filter((f) => f.resolved)
                .map((flag) => (
                  <div key={flag.id} className="text-sm font-corp-body text-gray-700">
                    <p>
                      <strong>{flag.employeeName}</strong> - {flag.description}
                    </p>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
