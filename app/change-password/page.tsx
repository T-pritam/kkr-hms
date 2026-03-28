'use client'

import { useState, Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

function ChangePasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isTokenValid, setIsTokenValid] = useState<boolean | null>(null)
  const [isTokenExpired, setIsTokenExpired] = useState(false)
  const [isSessionMode, setIsSessionMode] = useState(false)

  // Validate token on component mount
  useEffect(() => {
    if (token) {
      validateToken()
    } else {
      // No token = session-based change (admin forced password reset)
      setIsSessionMode(true)
      setIsTokenValid(true)
    }
  }, [token])

  const validateToken = async () => {
    try {
      // Try to use the token - if it returns an error about expiry, we know it's expired
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newPassword: 'testtestt', // dummy password just to validate token
          token,
          check: true
        }),
      })

      const data = await response.json()

      if (data.error && data.error.includes('expired')) {
        setIsTokenExpired(true)
        setIsTokenValid(false)
        setError(data.error)
      } else if (!response.ok && data.error) {
        setIsTokenValid(false)
        setError(data.error)
      } else {
        // Don't proceed if validation passed - let user submit the form
        setIsTokenValid(true)
      }
    } catch (err: any) {
      setIsTokenValid(false)
      setError('Failed to validate token')
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    // if (newPassword.length < 8) {
    //   setError('Password must be at least 8 characters long')
    //   setLoading(false)
    //   return
    // }

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newPassword,
          token,
          check :false
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Password change failed')
      }

      // Redirect to dashboard if already authenticated (session mode), otherwise login
      router.push(isSessionMode ? '/dashboard' : '/login')
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md animate-fadeIn">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <div className="text-4xl font-bold">
              <span className="text-primary">KKR</span>
              <span className="text-foreground ml-2">HMS</span>
            </div>
          </div>
          <CardTitle className="text-2xl text-center">Change Password</CardTitle>
          <CardDescription className="text-center">
            Create a new password for your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Loading state */}
          {isTokenValid === null && (
            <div className="text-center py-8">
              <p className="text-muted">Validating reset link...</p>
            </div>
          )}

          {/* Token expired state */}
          {isTokenExpired && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
                <p className="font-medium mb-2">Reset Link Expired</p>
                <p>{error}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/login')}
                  className="w-full"
                >
                  Back to Login
                </Button>
                <Button
                  type="button"
                  onClick={() => router.push('/reset-password')}
                  className="w-full"
                >
                  Request New Link
                </Button>
              </div>
            </div>
          )}

          {/* Invalid token state */}
          {isTokenValid === false && !isTokenExpired && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
                <p className="font-medium mb-2">Invalid Reset Link</p>
                <p>{error || 'The reset link is invalid or has already been used.'}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/login')}
                  className="w-full"
                >
                  Back to Login
                </Button>
                <Button
                  type="button"
                  onClick={() => router.push('/reset-password')}
                  className="w-full"
                >
                  Request New Link
                </Button>
              </div>
            </div>
          )}

          {/* Valid token - show form */}
          {isTokenValid && (
            <form onSubmit={handleChangePassword} className="space-y-4">
              {isSessionMode && (
                <div className="p-3 rounded-lg bg-info/10 border border-info/30 text-foreground text-sm">
                  Your password has been reset by an administrator. Please set a new password to continue.
                </div>
              )}
              {error && (
                <div className="p-3 rounded-lg bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
                  {error}
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={loading}
                />
                <p className="text-xs text-muted">Must be at least 8 characters</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading}
              >
                {loading ? 'Changing Password...' : 'Change Password'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ChangePasswordContent />
    </Suspense>
  )
}

