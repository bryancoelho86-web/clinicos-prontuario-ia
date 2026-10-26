export function somenteDigitos(cpf) {
  return (cpf || '').replace(/\D/g, '');
}

// Algoritmo padrão de validação de CPF (dígitos verificadores módulo 11).
// Rejeita também sequências de dígito único (000.000.000-00, 111.111.111-11
// etc.) — passam no cálculo dos dígitos verificadores mas nunca são CPFs
// reais emitidos pela Receita Federal.
export function validarCPF(cpf) {
  const digits = somenteDigitos(cpf);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const calcularDigito = (base) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * (base.length + 1 - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const digito1 = calcularDigito(digits.slice(0, 9));
  if (digito1 !== Number(digits[9])) return false;

  const digito2 = calcularDigito(digits.slice(0, 10));
  if (digito2 !== Number(digits[10])) return false;

  return true;
}

export function formatarCPF(cpf) {
  const digits = somenteDigitos(cpf).slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}
