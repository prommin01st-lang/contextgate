import ky from 'ky';

export const api = ky.create({
  prefixUrl: import.meta.env.VITE_API_URL || 'http://localhost:8899',
  hooks: {
    beforeRequest: [
      (request) => {
        const token = localStorage.getItem('cg_token');
        if (token) {
          request.headers.set('Authorization', `Bearer ${token}`);
        }
      },
    ],
  },
});
