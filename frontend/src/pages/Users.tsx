import { useState } from 'react'
import { useQuery } from 'react-query'
import { Plus, Trash2, Shield, User as UserIcon, Key, Eye, EyeOff } from 'lucide-react'
import { usersApi } from '../services/api'
import { useAuthStore } from '../stores/auth'
import type { User } from '../types'

export function UsersPage() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'operator' })
  const { user: currentUser } = useAuthStore()
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const { data: users, isLoading, refetch } = useQuery<User[]>('users', async () => {
    const response = await usersApi.list()
    return response.data.data
  })

  const handleCreate = async () => {
    await usersApi.create(newUser)
    setIsModalOpen(false)
    setNewUser({ username: '', password: '', role: 'operator' })
    refetch()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this user?')) return
    await usersApi.delete(id)
    refetch()
  }

  const handlePasswordChange = async () => {
    if (!editingUser || !newPassword) return
    await usersApi.update(editingUser.id, { password: newPassword })
    setEditingUser(null)
    setNewPassword('')
    setShowPassword(false)
    alert('Password updated successfully')
    refetch()
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <Shield className="w-4 h-4 text-yellow-500" />
      default:
        return <UserIcon className="w-4 h-4 text-muted-foreground" />
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-muted-foreground">Manage panel users</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" />
          Add User
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium">User</th>
                <th className="text-left px-4 py-3 text-sm font-medium">Role</th>
                <th className="text-left px-4 py-3 text-sm font-medium">2FA</th>
                <th className="text-left px-4 py-3 text-sm font-medium">Created</th>
                <th className="text-right px-4 py-3 text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users?.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {getRoleIcon(user.role)}
                      <span className="font-medium">{user.username}</span>
                      {user.id === currentUser?.id && (
                        <span className="text-xs text-muted-foreground">(You)</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="capitalize">{user.role}</span>
                  </td>
                  <td className="px-4 py-3">
                    {user.totp_enabled ? (
                      <span className="text-green-500">Enabled</span>
                    ) : (
                      <span className="text-muted-foreground">Disabled</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(user.created_at * 1000).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditingUser(user)}
                        className="p-1.5 rounded hover:bg-muted"
                        title="Change password"
                      >
                        <Key className="w-4 h-4" />
                      </button>
                      {user.id !== currentUser?.id && (
                        <button
                          onClick={() => handleDelete(user.id)}
                          className="p-1.5 rounded hover:bg-muted text-destructive"
                          title="Delete user"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Add User</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Username</label>
                <input
                  type="text"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Password</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
                >
                  <option value="operator">Operator</option>
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Password Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Change Password</h2>
            <p className="text-sm text-muted-foreground mb-4">
              User: <span className="font-medium text-foreground">{editingUser.username}</span>
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">New Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-10 rounded-lg bg-secondary border border-border"
                    placeholder="Enter new password"
                    autoFocus
                  />
                  <button
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setEditingUser(null)
                  setNewPassword('')
                  setShowPassword(false)
                }}
                className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80"
              >
                Cancel
              </button>
              <button
                onClick={handlePasswordChange}
                disabled={!newPassword}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Update Password
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
