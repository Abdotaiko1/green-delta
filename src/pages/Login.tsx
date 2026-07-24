import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const BYPASS_AUTH = import.meta.env.VITE_BYPASS_AUTH === 'true';
const LOGIN_SESSION_KEY = 'active_login_session_id';
const TRACK_LOGIN_LOCATION = true;

const getLoginLocation = () => new Promise<{ latitude: number; longitude: number; accuracy: number } | null>((resolve) => {
  if (!navigator.geolocation) {
    resolve(null);
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (position) => resolve({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
    }),
    () => resolve(null),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
  );
});

const loginSchema = z.object({
  email: z.string().email({ message: 'البريد الإلكتروني غير صالح' }),
  password: z.string().min(6, { message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { devSignIn } = useAuth();

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: 'admin@greendelta.com',
      password: 'Admin@123',
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setLoading(true);
    try {
      if (BYPASS_AUTH) {
        devSignIn();
        toast.success('تم تسجيل الدخول (وضع تجريبي)');
        navigate('/', { replace: true });
        return;
      }

      // Start geolocation immediately from the user's submit action. Safari and
      // some embedded browsers may suppress the prompt if it starts only after
      // waiting for the authentication network request.
      const locationPromise = TRACK_LOGIN_LOCATION
        ? getLoginLocation()
        : Promise.resolve(null);

      const [{ data: authData, error }, location] = await Promise.all([
        supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
        }),
        locationPromise,
      ]);

      if (error) {
        toast.error('اسم المستخدم أو كلمة المرور غير صحيحة');
      } else {
        if (authData.user) {
          const { data: loginSession } = await supabase
            .from('login_sessions')
            .insert([{
              user_id: authData.user.id,
              latitude: location?.latitude ?? null,
              longitude: location?.longitude ?? null,
              accuracy_meters: location?.accuracy ?? null,
            }])
            .select('id')
            .single();
          if (loginSession?.id) localStorage.setItem(LOGIN_SESSION_KEY, loginSession.id);
        }
        toast.success('تم تسجيل الدخول بنجاح');
        if (TRACK_LOGIN_LOCATION && !location) {
          toast.info('تم الدخول بدون موقع؛ اسمح للموقع من إعدادات المتصفح لتسجيله');
        }
        navigate('/', { replace: true });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'حدث خطأ ما';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-background" dir="rtl">
      <div className="flex w-full flex-col justify-center px-4 md:w-1/2 md:px-12 lg:px-24">
        <div className="mx-auto w-full max-w-md space-y-8">
          <div className="space-y-3 text-center">
            <img src="/green-delta-logo.svg" alt="Green Delta Elevators" className="mx-auto h-32 w-32 rounded-2xl bg-white object-contain shadow-sm ring-1 ring-border" />
            <div>
              <h1 className="text-3xl font-black font-heading text-primary tracking-wide" dir="ltr">GREEN DELTA</h1>
              <p className="font-bold text-foreground">شركة جرين دلتا للمصاعد</p>
            </div>
            <p className="text-muted-foreground font-sans">قم بتسجيل الدخول للوصول إلى لوحة التحكم</p>
            {BYPASS_AUTH && (
              <p className="text-sm text-amber-600">وضع تجريبي: سيتم الدخول مباشرة بدون Supabase</p>
            )}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@greendelta.com"
                autoComplete="email"
                {...register('email')}
                className={errors.email ? 'border-destructive' : ''}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register('password')}
                className={errors.password ? 'border-destructive' : ''}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'جاري الدخول...' : 'تسجيل الدخول'}
            </Button>
            {TRACK_LOGIN_LOCATION && (
              <p className="text-center text-sm text-muted-foreground">
                عند تسجيل الدخول اضغط «سماح» لتسجيل موقع الدخول في سجل الحضور.
              </p>
            )}
          </form>
        </div>
      </div>

      <div className="hidden w-1/2 bg-muted md:block relative">
        <div className="absolute inset-0 bg-primary/20 z-10 mix-blend-multiply"></div>
        <img
          src="https://miaoda-site-img.s3cdn.medo.dev/images/KLing_c10ec13f-02d2-47cb-bc61-98ff986fb803.jpg"
          alt="Elevator maintenance"
          className="h-full w-full object-cover"
        />
        <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/80 to-transparent p-12 text-white">
          <div className="mb-5 inline-flex items-center gap-3 rounded-xl bg-white/95 px-4 py-3 text-slate-900 shadow-lg" dir="ltr">
            <img src="/green-delta-logo.svg" alt="Green Delta" className="h-14 w-14 rounded-lg object-contain" />
            <div><div className="text-xl font-black tracking-wide">GREEN DELTA</div><div className="text-xs font-bold tracking-wider">ELEVATORS CO.</div></div>
          </div>
          <h2 className="text-4xl font-bold font-heading mb-4">الدقة والموثوقية في كل طابق</h2>
          <p className="text-lg opacity-90 max-w-lg">
            نظام متكامل لإدارة الصيانة، الأعطال، والمخزون لضمان أفضل أداء لمصاعدكم.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
