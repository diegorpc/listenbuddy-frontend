<template>
  <div class="welcome-container">
    <div class="welcome-header">
      <h1>Welcome to ListenBuddy</h1>
      <p>Your music companion</p>
    </div>

    <div class="card">
      <h2 class="card-title">Get Started</h2>
      <form class="auth-form" @submit.prevent>
        <div class="form-group">
          <label for="username">Username</label>
          <input 
            type="text" 
            id="username" 
            placeholder="Enter your username"
            v-model="username"
          />
        </div>

        <div class="form-group">
          <label for="password">Password</label>
          <div class="password-input-wrapper">
            <input 
              :type="showPassword ? 'text' : 'password'" 
              id="password" 
              placeholder="Enter your password"
              v-model="password"
            />
            <button 
              type="button" 
              class="toggle-password"
              @click="showPassword = !showPassword"
              :aria-label="showPassword ? 'Hide password' : 'Show password'"
            >
              <component
                :is="showPassword ? EyeSlashIcon : EyeIcon"
                class="toggle-password-icon"
                aria-hidden="true"
              />
            </button>
          </div>
        </div>

        <div v-if="errorMessage" class="error-message">
          {{ errorMessage }}
        </div>

        <div class="button-group">
          <button 
            type="button" 
            class="btn btn-primary" 
            @click="handleLogin"
            :disabled="loading"
          >
            {{ loading && isLogin ? 'Logging in...' : 'Log In' }}
          </button>
          <button 
            type="button" 
            class="btn btn-secondary" 
            @click="handleRegister"
            :disabled="loading"
          >
            {{ loading && !isLogin ? 'Registering...' : 'Register' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { authService } from '../services/auth'
import { EyeIcon, EyeSlashIcon } from '@heroicons/vue/24/outline'

const router = useRouter()
const username = ref('')
const password = ref('')
const showPassword = ref(false)
const errorMessage = ref('')
const loading = ref(false)
const isLogin = ref(false)

onMounted(() => {
  // Redirect if already authenticated
  if (authService.isAuthenticated()) {
    router.push('/home')
  }
})

const handleLogin = async () => {
  if (!username.value || !password.value) {
    errorMessage.value = 'Please enter both username and password'
    return
  }

  errorMessage.value = ''
  loading.value = true
  isLogin.value = true

  try {
    await authService.login(username.value, password.value)
    router.push('/home')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Login failed'
  } finally {
    loading.value = false
  }
}

const handleRegister = async () => {
  if (!username.value || !password.value) {
    errorMessage.value = 'Please enter both username and password'
    return
  }

  errorMessage.value = ''
  loading.value = true
  isLogin.value = false

  try {
    await authService.register(username.value, password.value)
    router.push('/home')
  } catch (error) {
    const errorData = error as { error?: unknown; message?: unknown }
    if (typeof errorData?.error === 'string') {
      errorMessage.value = errorData.error
    } else if (typeof errorData?.message === 'string') {
      errorMessage.value = errorData.message
    } else {
      errorMessage.value = 'Registration failed'
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
@import '../styles/WelcomePage.css';
</style>
