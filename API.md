# API Documentation

## Authentication APIs

### POST /api/auth/login
Login with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (Success):**
```json
{
  "success": true,
  "needsPasswordChange": false,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "username",
    "role": "ADMIN"
  }
}
```

**Response (Error):**
```json
{
  "error": "Invalid credentials"
}
```

**HTTP Status Codes:**
- 200: Success
- 400: Missing fields
- 401: Invalid credentials
- 403: Account inactive

**Sets Cookies:**
- `accessToken` (httpOnly, 10min expiry)
- `refreshToken` (httpOnly, 7day expiry)

---

### POST /api/auth/reset-password
Request a password reset email.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true
}
```

**Note:** Always returns success (even if user doesn't exist) for security.

**Side Effects:**
- Generates reset token (1-hour expiry)
- Sends email via Brevo Edge Function

---

### POST /api/auth/change-password
Change password (with current password or reset token).

**Request Body (With Current Password):**
```json
{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword"
}
```

**Request Body (With Reset Token):**
```json
{
  "token": "reset_token_from_email",
  "newPassword": "newpassword"
}
```

**Response:**
```json
{
  "success": true
}
```

**HTTP Status Codes:**
- 200: Success
- 400: Validation error
- 401: Unauthorized

---

### POST /api/auth/logout
Logout current user.

**Response:**
```json
{
  "success": true
}
```

**Side Effects:**
- Clears `accessToken` cookie
- Clears `refreshToken` cookie

---

## Admin APIs (Admin Role Required)

### GET /api/admin/users
Get all users.

**Headers Required:**
- Cookie: `accessToken=...`

**Response:**
```json
{
  "users": [
    {
      "id": "uuid",
      "username": "john_doe",
      "email": "john@example.com",
      "role": "DOCTOR",
      "status": "ACTIVE",
      "last_login": "2026-02-03T10:30:00Z",
      "created_at": "2026-01-01T00:00:00Z"
    }
  ]
}
```

**HTTP Status Codes:**
- 200: Success
- 401: Unauthorized (no token)
- 403: Forbidden (not admin)

---

### POST /api/admin/users
Create a new user.

**Headers Required:**
- Cookie: `accessToken=...`

**Request Body:**
```json
{
  "username": "new_user",
  "email": "newuser@example.com",
  "password": "password123",
  "role": "RECEPTIONIST",
  "status": "ACTIVE"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "username": "new_user",
    "email": "newuser@example.com",
    "role": "RECEPTIONIST",
    "status": "ACTIVE"
  }
}
```

**HTTP Status Codes:**
- 200: Success
- 400: Missing fields or email exists
- 401: Unauthorized
- 403: Forbidden

**Validation:**
- Password: Minimum 8 characters
- Email: Must be unique
- Role: Must be one of: ADMIN, DOCTOR, NURSE, RECEPTIONIST
- Status: Must be one of: ACTIVE, INACTIVE

**Side Effects:**
- Password is hashed with bcrypt (12 rounds)
- `needs_password_change` is set to `true`

---

### PUT /api/admin/users/[id]
Update a user (full update).

**Headers Required:**
- Cookie: `accessToken=...`

**Request Body:**
```json
{
  "username": "updated_name",
  "email": "updated@example.com",
  "role": "DOCTOR",
  "status": "INACTIVE"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "username": "updated_name",
    "email": "updated@example.com",
    "role": "DOCTOR",
    "status": "INACTIVE",
    "updated_at": "2026-02-03T10:30:00Z"
  }
}
```

**HTTP Status Codes:**
- 200: Success
- 401: Unauthorized
- 403: Forbidden

---

### PATCH /api/admin/users/[id]
Partial update a user (e.g., toggle status).

**Headers Required:**
- Cookie: `accessToken=...`

**Request Body:**
```json
{
  "status": "INACTIVE"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "status": "INACTIVE",
    "updated_at": "2026-02-03T10:30:00Z"
  }
}
```

---

### DELETE /api/admin/users/[id]
Delete a user.

**Headers Required:**
- Cookie: `accessToken=...`

**Response:**
```json
{
  "success": true
}
```

**HTTP Status Codes:**
- 200: Success
- 400: Cannot delete own account
- 401: Unauthorized
- 403: Forbidden

**Restrictions:**
- Admin cannot delete their own account

---

### POST /api/admin/users/[id]/reset-password
Send password reset email to a specific user (admin function).

**Headers Required:**
- Cookie: `accessToken=...`

**Response:**
```json
{
  "success": true
}
```

**HTTP Status Codes:**
- 200: Success
- 401: Unauthorized
- 403: Forbidden
- 404: User not found

**Side Effects:**
- Generates reset token (1-hour expiry)
- Sets `needs_password_change` to `true`
- Sends email via Brevo Edge Function

---

## Supabase Edge Functions

### POST /functions/v1/send-reset-email
Send password reset email via Brevo.

**Headers Required:**
- `Authorization: Bearer SUPABASE_SERVICE_ROLE_KEY`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "email": "user@example.com",
  "resetUrl": "https://app.com/change-password?token=xxx",
  "username": "John Doe"
}
```

**Response:**
```json
{
  "success": true,
  "messageId": "brevo_message_id"
}
```

**Environment Variables Required:**
- `BREVO_API_KEY`
- `BREVO_SENDER_EMAIL`
- `BREVO_SENDER_NAME`

**Email Template:**
- Professional HTML email with KKR Hospital branding
- Includes reset link button
- Shows link as text (for copy-paste)
- Mentions 1-hour expiry
- Responsive design

---

## Authentication Flow

### Login Flow
```
1. User submits email + password to POST /api/auth/login
2. Server validates credentials against database
3. Server checks user status (must be ACTIVE)
4. Server generates JWT access token (10min) and refresh token (7day)
5. Server sets httpOnly cookies
6. Server returns user data + needsPasswordChange flag
7. Client redirects to:
   - /change-password if needsPasswordChange = true
   - /dashboard if needsPasswordChange = false
```

### Password Reset Flow
```
1. User submits email to POST /api/auth/reset-password
2. Server generates random reset token
3. Server saves token + expiry to database
4. Server calls Edge Function to send email
5. User receives email with reset link
6. User clicks link -> /change-password?token=xxx
7. User submits new password to POST /api/auth/change-password
8. Server validates token and expiry
9. Server updates password and clears token
10. User redirected to /dashboard
```

### Token Refresh Flow (Automatic)
```
1. Middleware checks access token on each request
2. If access token expired:
   a. Middleware reads refresh token
   b. Validates refresh token
   c. Generates new access token
   d. Sets new access token cookie
   e. Continues request
3. If refresh token also expired:
   a. Middleware redirects to /login
```

### Authorization Flow
```
1. User makes request to protected route
2. Middleware extracts access token from cookie
3. Middleware verifies token signature
4. Middleware checks user role from token payload
5. Middleware compares role against route requirements:
   - Admin-only routes: /employees, /finances, /admin
   - All-user routes: /dashboard, /patients, /doctors
6. If authorized: continue
7. If not authorized: redirect to /dashboard or /login
```

---

## Role-Based Access Control (RBAC)

### Route Access Matrix

| Route | Admin | Doctor | Nurse | Receptionist |
|-------|-------|--------|-------|--------------|
| /dashboard | ✅ | ✅ | ✅ | ✅ |
| /patients | ✅ | ✅ | ✅ | ✅ |
| /doctors | ✅ | ✅ | ✅ | ✅ |
| /employees/details | ✅ | ❌ | ❌ | ❌ |
| /employees/salary | ✅ | ❌ | ❌ | ❌ |
| /finances | ✅ | ❌ | ❌ | ❌ |
| /daily-ledger/summary | ✅ | ✅ | ✅ | ✅ |
| /daily-ledger/employee-ledger | ✅ | ❌ | ❌ | ❌ |
| /admin | ✅ | ❌ | ❌ | ❌ |

### API Access Matrix

| Endpoint | Admin | Doctor | Nurse | Receptionist |
|----------|-------|--------|-------|--------------|
| GET /api/admin/users | ✅ | ❌ | ❌ | ❌ |
| POST /api/admin/users | ✅ | ❌ | ❌ | ❌ |
| PUT /api/admin/users/[id] | ✅ | ❌ | ❌ | ❌ |
| DELETE /api/admin/users/[id] | ✅ | ❌ | ❌ | ❌ |
| POST /api/auth/change-password | ✅ | ✅ | ✅ | ✅ |
| POST /api/auth/logout | ✅ | ✅ | ✅ | ✅ |

---

## Error Responses

All error responses follow this format:

```json
{
  "error": "Error message describing what went wrong"
}
```

### Common HTTP Status Codes

- **200 OK**: Request successful
- **400 Bad Request**: Invalid input or validation error
- **401 Unauthorized**: Missing or invalid authentication token
- **403 Forbidden**: Valid token but insufficient permissions
- **404 Not Found**: Resource not found
- **500 Internal Server Error**: Server error

### Common Error Messages

- `"Unauthorized"` - No access token provided
- `"Forbidden"` - User doesn't have required role
- `"Invalid credentials"` - Wrong email or password
- `"Account is inactive. Please contact administrator."` - User status is INACTIVE
- `"Email already exists"` - Trying to create user with duplicate email
- `"Invalid or expired reset token"` - Password reset token is invalid or expired
- `"Cannot delete your own account"` - Admin trying to delete themselves
- `"Missing required fields"` - Required fields not provided in request

---

## Security Considerations

### JWT Tokens
- **Access Token**: 10 minutes expiry, used for API authentication
- **Refresh Token**: 7 days expiry, used to generate new access tokens
- Both stored as httpOnly cookies (not accessible via JavaScript)
- Secure flag enabled in production
- SameSite=Lax for CSRF protection

### Password Security
- Hashed using bcrypt with 12 rounds
- Minimum 8 characters required
- Default users created with `needs_password_change = true`

### Rate Limiting
- Not currently implemented (TODO for production)
- Recommended: Implement rate limiting on login endpoints

### CORS
- Edge Functions allow all origins (*)
- Should be restricted to specific domains in production

---

## Testing with cURL

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@kkrhospital.com","password":"Admin@123"}' \
  -c cookies.txt
```

### Get Users (Admin)
```bash
curl -X GET http://localhost:3000/api/admin/users \
  -b cookies.txt
```

### Create User (Admin)
```bash
curl -X POST http://localhost:3000/api/admin/users \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "username":"testuser",
    "email":"test@example.com",
    "password":"Test@123",
    "role":"RECEPTIONIST",
    "status":"ACTIVE"
  }'
```

### Logout
```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -b cookies.txt
```

---

**Last Updated**: February 3, 2026
