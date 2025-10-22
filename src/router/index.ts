import { createRouter, createWebHistory } from 'vue-router'
import WelcomePage from '../pages/WelcomePage.vue'
import HomePage from '../pages/HomePage.vue'
import { authService } from '../services/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'welcome',
      component: WelcomePage,
      meta: { requiresGuest: true },
    },
    {
      path: '/home',
      name: 'home',
      component: HomePage,
      meta: { requiresAuth: true },
    },
  ],
})

// Route guards
router.beforeEach((to, from, next) => {
  const isAuthenticated = authService.isAuthenticated()

  if (to.meta.requiresAuth && !isAuthenticated) {
    // Protected route, user not authenticated - redirect to welcome
    next('/')
  } else if (to.meta.requiresGuest && isAuthenticated) {
    // Guest-only route, user is authenticated - redirect to home
    next('/home')
  } else {
    // Allow navigation
    next()
  }
})

export default router
