import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const requiredRoles = route.data['roles'] as string[];
  const user = authService.currentUser();

  if (!user) {
    router.navigate(['/auth/login']);
    return false;
  }

  if (requiredRoles && requiredRoles.includes(user.role)) {
    return true;
  }

  // Redirect to appropriate dashboard based on role
  switch (user.role) {
    case 'RIDER':
      router.navigate(['/rider']);
      break;
    case 'DRIVER':
      router.navigate(['/driver']);
      break;
    case 'ADMIN':
      router.navigate(['/admin']);
      break;
    default:
      router.navigate(['/auth/login']);
  }

  return false;
};
