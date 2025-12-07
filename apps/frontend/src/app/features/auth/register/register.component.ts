import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService, RegisterDto } from '../../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div
      class="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 px-4 py-12"
    >
      <div class="w-full max-w-md">
        <!-- Logo -->
        <div class="text-center mb-8">
          <div
            class="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl mb-4"
          >
            <svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <h1 class="text-3xl font-bold text-white tracking-tight">Join The RIDE</h1>
          <p class="text-slate-400 mt-2">Create your account</p>
        </div>

        <!-- Form Card -->
        <div
          class="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-slate-700/50"
        >
          @if (error()) {
          <div class="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
            <p class="text-red-400 text-sm">{{ error() }}</p>
          </div>
          }

          <form (ngSubmit)="onSubmit()" class="space-y-5">
            <!-- Role Selection -->
            <div>
              <label class="block text-sm font-medium text-slate-300 mb-3">I want to</label>
              <div class="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  (click)="role = 'RIDER'"
                  [class]="
                    role === 'RIDER'
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-slate-900/50 border-slate-600 text-slate-300 hover:border-slate-500'
                  "
                  class="p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2"
                >
                  <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                  <span class="font-medium">Ride</span>
                </button>
                <button
                  type="button"
                  (click)="role = 'DRIVER'"
                  [class]="
                    role === 'DRIVER'
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-slate-900/50 border-slate-600 text-slate-300 hover:border-slate-500'
                  "
                  class="p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2"
                >
                  <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                    />
                  </svg>
                  <span class="font-medium">Drive</span>
                </button>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-slate-300 mb-2">Email</label>
              <input
                type="email"
                [(ngModel)]="email"
                name="email"
                required
                class="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-slate-300 mb-2">Password</label>
              <input
                type="password"
                [(ngModel)]="password"
                name="password"
                required
                minlength="6"
                class="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                placeholder="••••••••"
              />
            </div>

            <!-- Driver Fields -->
            @if (role === 'DRIVER') {
            <div class="space-y-5 pt-4 border-t border-slate-700">
              <p class="text-sm text-slate-400">Vehicle Information</p>
              <div>
                <label class="block text-sm font-medium text-slate-300 mb-2">License Plate</label>
                <input
                  type="text"
                  [(ngModel)]="vehiclePlate"
                  name="vehiclePlate"
                  required
                  class="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder="ABC 123"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-300 mb-2">Vehicle Model</label>
                <input
                  type="text"
                  [(ngModel)]="vehicleModel"
                  name="vehicleModel"
                  required
                  class="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder="Toyota Camry"
                />
              </div>
            </div>
            }

            <button
              type="submit"
              [disabled]="loading() || !isFormValid()"
              class="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 mt-6"
            >
              @if (loading()) {
              <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle
                  class="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="4"
                  fill="none"
                />
                <path
                  class="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Creating account... } @else { Create Account }
            </button>

            @if (role === 'DRIVER') {
            <p class="text-xs text-slate-500 text-center">
              Driver accounts require admin approval before you can start driving.
            </p>
            }
          </form>

          <div class="mt-6 text-center">
            <p class="text-slate-400 text-sm">
              Already have an account?
              <a routerLink="/auth/login" class="text-indigo-400 hover:text-indigo-300 font-medium">
                Sign in
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class RegisterComponent {
  email = '';
  password = '';
  role: 'RIDER' | 'DRIVER' = 'RIDER';
  vehiclePlate = '';
  vehicleModel = '';
  loading = signal(false);
  error = signal<string | null>(null);

  constructor(private authService: AuthService) {}

  isFormValid(): boolean {
    if (!this.email || !this.password || this.password.length < 6) {
      return false;
    }
    if (this.role === 'DRIVER' && (!this.vehiclePlate || !this.vehicleModel)) {
      return false;
    }
    return true;
  }

  onSubmit(): void {
    if (!this.isFormValid()) {
      this.error.set('Please fill in all required fields');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    const dto: RegisterDto = {
      email: this.email,
      password: this.password,
      role: this.role,
      ...(this.role === 'DRIVER' && {
        vehicleInfo: {
          plate: this.vehiclePlate,
          model: this.vehicleModel,
        },
      }),
    };

    this.authService.register(dto).subscribe({
      next: () => {
        this.loading.set(false);
        this.authService.navigateByRole();
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.message || 'Registration failed. Please try again.');
      },
    });
  }
}
