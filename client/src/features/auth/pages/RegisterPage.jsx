import { useSearchParams } from 'react-router-dom';
import { RegisterForm } from '../components/RegisterForm';

export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || undefined;

  return (
    <section className="mx-auto max-w-md">
      <RegisterForm redirectTo={redirectTo} />
    </section>
  );
}
