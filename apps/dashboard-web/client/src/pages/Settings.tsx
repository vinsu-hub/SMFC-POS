import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings as SettingsIcon, Bell, Users, Lock, Save, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { BRANCH_CONFIG, LOCATIONS, type Branch } from '@/lib/types';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'employee' | 'manager' | 'executive';
  branch: string;
  status: 'active' | 'inactive';
  lastLogin: Date;
}

export default function Settings() {
  const { user, logout } = useAuth();
  const isEmployee = user?.role === 'employee';
  const [activeTab, setActiveTab] = useState('general');

  // General Settings
  const defaultBranch: Branch = user?.branch ?? LOCATIONS[0].themeKey;
  const [branchName, setBranchName] = useState(BRANCH_CONFIG[defaultBranch].name);
  const [branchPhone, setBranchPhone] = useState('+63 917 123 4567');
  const [branchEmail, setBranchEmail] = useState('branch@saintmichael.com');
  const [operatingHours, setOperatingHours] = useState('11:00 AM - 11:00 PM');

  // Notification Settings
  const [notifications, setNotifications] = useState({
    lowStock: true,
    spoilage: true,
    attendance: true,
    sales: false,
  });

  // Users
  const [users, setUsers] = useState<User[]>([
    {
      id: '1',
      name: 'John Smith',
      email: 'john@example.com',
      role: 'employee',
      branch: defaultBranch,
      status: 'active',
      lastLogin: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
    {
      id: '2',
      name: 'Sarah Manager',
      email: 'sarah@example.com',
      role: 'manager',
      branch: defaultBranch,
      status: 'active',
      lastLogin: new Date(Date.now() - 30 * 60 * 1000),
    },
    {
      id: '3',
      name: 'Alex Employee',
      email: 'alex@example.com',
      role: 'employee',
      branch: defaultBranch,
      status: 'inactive',
      lastLogin: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    },
  ]);

  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'employee' });
  const handleSaveGeneral = () => {
    toast.success('Branch settings saved');
  };

  const handleNotificationChange = (key: keyof typeof notifications) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAddUser = () => {
    if (!newUser.name || !newUser.email) {
      toast.error('Please fill in all fields');
      return;
    }

    const newUserObj: User = {
      id: Math.random().toString(36).substr(2, 9),
      name: newUser.name,
      email: newUser.email,
      role: newUser.role as 'employee' | 'manager' | 'executive',
      branch: defaultBranch,
      status: 'active',
      lastLogin: new Date(),
    };

    setUsers([...users, newUserObj]);
    setNewUser({ name: '', email: '', role: 'employee' });
    toast.success('User added successfully');
  };

  const handleDeleteUser = (id: string) => {
    setUsers(users.filter((u) => u.id !== id));
    toast.success('User removed');
  };

  const handleToggleUserStatus = (id: string) => {
    setUsers(
      users.map((u) =>
        u.id === id ? { ...u, status: u.status === 'active' ? 'inactive' : 'active' } : u
      )
    );
  };

  const formatLastLogin = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'employee':
        return 'bg-accent-soft text-accent-foreground';
      case 'manager':
        return 'bg-success-bg text-success';
      case 'executive':
        return 'bg-primary text-primary-foreground';
      default:
        return 'bg-secondary text-foreground';
    }
  };

  if (isEmployee) {
    return (
      <DashboardLayout title="Settings">
        <div className="p-6">
          <Card className="border-l-4 border-l-primary max-w-lg">
            <CardHeader>
              <CardTitle className="font-corp-display">Account Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-corp-body text-muted-foreground mb-2">Current User</p>
                <p className="font-corp-display font-semibold text-foreground">{user?.email}</p>
                <p className="text-xs text-muted-foreground capitalize">Role: {user?.role}</p>
              </div>
              <Button
                onClick={logout}
                variant="outline"
                className="w-full font-corp-body text-destructive border-error-bg hover:bg-error-bg"
              >
                Sign Out
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Settings">
      <div className="p-6 space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="general" className="font-corp-body">
              General
            </TabsTrigger>
            <TabsTrigger value="notifications" className="font-corp-body">
              Notifications
            </TabsTrigger>
            <TabsTrigger value="users" className="font-corp-body">
              Users
            </TabsTrigger>
            <TabsTrigger value="system" className="font-corp-body">
              System
            </TabsTrigger>
          </TabsList>

          {/* General Settings */}
          <TabsContent value="general" className="space-y-6">
            <Card className="border-l-4" style={{ borderLeftColor: BRANCH_CONFIG[defaultBranch].color }}>
              <CardHeader>
                <CardTitle className="font-corp-display">Branch Information</CardTitle>
                <CardDescription>Manage your branch details and operating hours</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground block mb-2">Branch Name</label>
                  <Input
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    className="font-corp-body"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-foreground block mb-2">Phone</label>
                    <Input
                      value={branchPhone}
                      onChange={(e) => setBranchPhone(e.target.value)}
                      className="font-corp-body"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground block mb-2">Email</label>
                    <Input
                      value={branchEmail}
                      onChange={(e) => setBranchEmail(e.target.value)}
                      className="font-corp-body"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground block mb-2">Operating Hours</label>
                  <Input
                    value={operatingHours}
                    onChange={(e) => setOperatingHours(e.target.value)}
                    className="font-corp-body"
                  />
                </div>

                <Button
                  onClick={handleSaveGeneral}
                  className="font-corp-display gap-2 w-full"
                >
                  <Save className="w-4 h-4" />
                  Save Changes
                </Button>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-primary">
              <CardHeader>
                <CardTitle className="font-corp-display">Account Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-corp-body text-muted-foreground mb-2">Current User</p>
                  <p className="font-corp-display font-semibold text-foreground">{user?.email}</p>
                  <p className="text-xs text-muted-foreground capitalize">Role: {user?.role}</p>
                </div>

                <Button
                  onClick={logout}
                  variant="outline"
                  className="w-full font-corp-body text-destructive border-error-bg hover:bg-error-bg"
                >
                  Sign Out
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications */}
          <TabsContent value="notifications" className="space-y-6">
            <Card className="border-l-4 border-l-warning">
              <CardHeader>
                <CardTitle className="font-corp-display">Alert Preferences</CardTitle>
                <CardDescription>Choose which alerts you want to receive</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-corp-body font-semibold text-foreground">Low Stock Alerts</p>
                      <p className="text-xs text-muted-foreground">Notified when inventory falls below threshold</p>
                    </div>
                    <Switch
                      checked={notifications.lowStock}
                      onCheckedChange={() => handleNotificationChange('lowStock')}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-corp-body font-semibold text-foreground">Spoilage Alerts</p>
                      <p className="text-xs text-muted-foreground">Notified when items expire or spoil</p>
                    </div>
                    <Switch
                      checked={notifications.spoilage}
                      onCheckedChange={() => handleNotificationChange('spoilage')}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-corp-body font-semibold text-foreground">Attendance Alerts</p>
                      <p className="text-xs text-muted-foreground">Notified of late arrivals and absences</p>
                    </div>
                    <Switch
                      checked={notifications.attendance}
                      onCheckedChange={() => handleNotificationChange('attendance')}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-corp-body font-semibold text-foreground">Sales Milestones</p>
                      <p className="text-xs text-muted-foreground">Notified when daily sales targets hit</p>
                    </div>
                    <Switch
                      checked={notifications.sales}
                      onCheckedChange={() => handleNotificationChange('sales')}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users Management */}
          <TabsContent value="users" className="space-y-6">
            <Card className="border-l-4 border-l-purple-500">
              <CardHeader>
                <CardTitle className="font-corp-display">Team Members</CardTitle>
                <CardDescription>Manage users and their roles</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="font-corp-display gap-2">
                      <Plus className="w-4 h-4" />
                      Add User
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle className="font-corp-display">Add Team Member</DialogTitle>
                      <DialogDescription>Create a new user account</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-foreground block mb-1">Name</label>
                        <Input
                          placeholder="John Doe"
                          value={newUser.name}
                          onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                          className="font-corp-body"
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium text-foreground block mb-1">Email</label>
                        <Input
                          placeholder="john@example.com"
                          value={newUser.email}
                          onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                          className="font-corp-body"
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium text-foreground block mb-1">Role</label>
                        <Select value={newUser.role} onValueChange={(value) => setNewUser({ ...newUser, role: value })}>
                          <SelectTrigger className="font-corp-body">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="employee">Employee</SelectItem>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="executive">Executive</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <Button
                        onClick={handleAddUser}
                        className="w-full font-corp-display"
                      >
                        Create User
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Login</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div>
                            <p className="font-corp-body font-semibold text-foreground">{u.name}</p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getRoleColor(u.role)}>
                            {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.status === 'active' ? 'default' : 'secondary'}>
                            {u.status.charAt(0).toUpperCase() + u.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatLastLogin(u.lastLogin)}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleUserStatus(u.id)}
                            className="text-sm"
                          >
                            {u.status === 'active' ? 'Deactivate' : 'Activate'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteUser(u.id)}
                            className="text-destructive hover:text-destructive/80"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* System Settings */}
          <TabsContent value="system" className="space-y-6">
            <Card className="border-l-4 border-l-destructive">
              <CardHeader>
                <CardTitle className="font-corp-display">System Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground font-corp-body mb-1">Version</p>
                    <p className="font-corp-display font-semibold text-foreground">v1.0.0</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-corp-body mb-1">Last Updated</p>
                    <p className="font-corp-display font-semibold text-foreground">2026-07-29</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-corp-body mb-1">Database Status</p>
                    <Badge className="bg-success-bg text-success">Connected</Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-corp-body mb-1">API Status</p>
                    <Badge className="bg-success-bg text-success">Operational</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-warning">
              <CardHeader>
                <CardTitle className="font-corp-display">Maintenance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" className="w-full font-corp-body justify-start">
                  Clear Cache
                </Button>
                <Button variant="outline" className="w-full font-corp-body justify-start">
                  Export Data
                </Button>
                <Button variant="outline" className="w-full font-corp-body justify-start text-destructive border-error-bg hover:bg-error-bg">
                  Reset to Defaults
                </Button>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-gray-500">
              <CardHeader>
                <CardTitle className="font-corp-display">Help & Support</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" className="w-full font-corp-body justify-start">
                  View Documentation
                </Button>
                <Button variant="outline" className="w-full font-corp-body justify-start">
                  Contact Support
                </Button>
                <Button variant="outline" className="w-full font-corp-body justify-start">
                  Report a Bug
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
